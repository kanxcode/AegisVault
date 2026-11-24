import os
import time
import re
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect
from typing import List, Dict, Any, Optional, Tuple

from app.database.connection import get_db, engine
from app.models.simulation import SystemEvent, ExecutionModel
from app.schemas.dbms import (
    SqlExecuteRequest, SqlExecuteResponse, LogicalPlanStep,
    TableSchemaResponse, TableSummary, SchemaInfo, ColumnInfo, ForeignKeyInfo, IndexInfo,
    DbOverviewResponse, PaginatedRecordsResponse, DbOperationRequest, DbOperationResponse
)
from app.os_engine.trace_engine import TraceCollector

router = APIRouter()

VALID_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
SYSTEM_SCHEMAS = {"information_schema", "mysql", "performance_schema", "sys", "pg_catalog"}
LARGE_TABLE_ESTIMATE_THRESHOLD = 50000

BLOCKED_PATTERNS = [
    r"\bPRAGMA\b",
    r"\bATTACH\b",
    r"\bDETACH\b",
    r"\bLOAD_EXTENSION\b",
    r"\bSQLITE_MASTER\b.*\bUPDATE\b",
    r"\bSQLITE_MASTER\b.*\bDELETE\b",
    r"\bVACUUM\b",
]


def _validate_identifier(ident: str, label: str = "identifier") -> str:
    if not ident or not VALID_IDENT_RE.match(ident):
        raise HTTPException(status_code=400, detail=f"Invalid database {label}: '{ident}'")
    return ident


def _quote_ident(ident: str) -> str:
    _validate_identifier(ident)
    return engine.dialect.identifier_preparer.quote_identifier(ident)


def _qualify_object(name: str, schema_name: Optional[str] = None) -> str:
    q_name = _quote_ident(name)
    dialect_name = engine.dialect.name.lower()
    if schema_name and schema_name not in ("ALL", "sqlite_internal", "aegis_main"):
        if dialect_name == "sqlite" and schema_name == "main":
            return q_name
        return f"{_quote_ident(schema_name)}.{q_name}"
    return q_name


def _get_row_count(
    db: Session,
    name: str,
    schema_name: str,
    object_type: str,
) -> Tuple[int, bool]:
    """Return (row_count, count_is_estimated) safely with large-table estimation."""
    dialect_name = engine.dialect.name.lower()
    if dialect_name == "mysql" and object_type == "TABLE":
        try:
            est = db.execute(
                text(
                    "SELECT TABLE_ROWS FROM information_schema.TABLES "
                    "WHERE TABLE_SCHEMA = :sch AND TABLE_NAME = :tbl"
                ),
                {"sch": schema_name, "tbl": name},
            ).scalar()
            if est is not None and int(est) > LARGE_TABLE_ESTIMATE_THRESHOLD:
                return int(est), True
        except Exception:
            pass

    if dialect_name == "sqlite" and object_type == "TABLE":
        try:
            has_stat1 = db.execute(
                text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sqlite_stat1'")
            ).scalar()
            if has_stat1:
                stat_row = db.execute(
                    text("SELECT stat FROM sqlite_stat1 WHERE tbl = :tbl LIMIT 1"),
                    {"tbl": name},
                ).scalar()
                if stat_row:
                    est_val = int(str(stat_row).split()[0])
                    if est_val > LARGE_TABLE_ESTIMATE_THRESHOLD:
                        return est_val, True
        except Exception:
            pass

    try:
        qual = _qualify_object(name, schema_name)
        cnt = db.execute(text(f"SELECT COUNT(*) FROM {qual}")).scalar()
        return int(cnt or 0), False
    except Exception:
        return 0, False


def _discover_catalog(
    db: Session,
    include_system: bool = False,
    schema_filter: Optional[str] = None,
) -> Tuple[List[SchemaInfo], List[TableSummary]]:
    """Dynamically introspect schemas, user tables, views, and optional system tables."""
    inspector = inspect(engine)
    dialect_name = engine.dialect.name.lower()

    try:
        raw_schemas = inspector.get_schema_names()
    except Exception:
        raw_schemas = ["main" if dialect_name == "sqlite" else (engine.url.database or "default")]

    if not raw_schemas:
        raw_schemas = ["main"]

    schemas_info: List[SchemaInfo] = []
    objects_summary: List[TableSummary] = []

    def _build_object_summary(obj_name: str, sch: str, obj_type: str, is_sys: bool) -> Optional[TableSummary]:
        if not VALID_IDENT_RE.match(obj_name):
            return None
        try:
            cols_meta = inspector.get_columns(
                obj_name,
                schema=None if sch in ("main", "sqlite_internal") and dialect_name == "sqlite" else sch,
            )
            cols = [c["name"] for c in cols_meta]
        except Exception:
            cols = []

        pk_col = None
        if obj_type == "TABLE":
            try:
                pk_constraint = inspector.get_pk_constraint(
                    obj_name,
                    schema=None if sch in ("main", "sqlite_internal") and dialect_name == "sqlite" else sch,
                )
                pk_cols = pk_constraint.get("constrained_columns", []) if pk_constraint else []
                pk_col = pk_cols[0] if pk_cols else None
            except Exception:
                pk_col = None

        row_count, is_est = _get_row_count(db, obj_name, sch, obj_type)
        size_kb = max(4, round((row_count * 128) / 1024, 1)) if obj_type != "VIEW" else 0
        size_str = "VIEW" if obj_type == "VIEW" else (
            f"{size_kb} KB" if size_kb < 1024 else f"{round(size_kb / 1024, 2)} MB"
        )

        return TableSummary(
            name=obj_name,
            schema_name=sch,
            object_type=obj_type,
            is_system=is_sys,
            rows=row_count,
            count_is_estimated=is_est,
            size=size_str,
            columns=cols,
            primary_key=pk_col,
            column_count=len(cols),
        )

    for sch in raw_schemas:
        is_sys_schema = sch.lower() in SYSTEM_SCHEMAS
        if is_sys_schema and not include_system:
            continue

        sch_arg = None if (dialect_name == "sqlite" and sch == "main") else sch
        user_tables: List[str] = []
        views: List[str] = []
        sys_tables: List[str] = []

        try:
            raw_tbls = inspector.get_table_names(schema=sch_arg)
            for t in raw_tbls:
                if dialect_name == "sqlite" and t.startswith("sqlite_"):
                    sys_tables.append(t)
                elif is_sys_schema:
                    sys_tables.append(t)
                else:
                    user_tables.append(t)
        except Exception:
            pass

        try:
            views = inspector.get_view_names(schema=sch_arg)
        except Exception:
            views = []

        if dialect_name == "sqlite" and include_system and sch == "main":
            try:
                sys_rows = db.execute(
                    text("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'sqlite_%'")
                ).fetchall()
                for r in sys_rows:
                    if r[0] not in sys_tables:
                        sys_tables.append(r[0])
            except Exception:
                pass

        schemas_info.append(
            SchemaInfo(
                name=sch,
                status="ONLINE",
                type="SYSTEM" if is_sys_schema else "PRIMARY",
                is_system=is_sys_schema,
                tables_count=len(user_tables),
                views_count=len(views),
                system_tables_count=len(sys_tables),
                tables=sorted(user_tables),
                views=sorted(views),
                system_tables=sorted(sys_tables) if include_system else [],
            )
        )

        matches_schema = (
            not schema_filter
            or schema_filter in ("ALL", "aegis_main")
            or schema_filter == sch
        )
        if not matches_schema:
            continue

        for t_name in sorted(user_tables):
            summary = _build_object_summary(t_name, sch, "TABLE", False)
            if summary:
                objects_summary.append(summary)

        for v_name in sorted(views):
            summary = _build_object_summary(v_name, sch, "VIEW", False)
            if summary:
                objects_summary.append(summary)

        if include_system:
            for st_name in sorted(sys_tables):
                summary = _build_object_summary(st_name, sch, "SYSTEM_TABLE", True)
                if summary:
                    objects_summary.append(summary)

    return schemas_info, objects_summary


def _resolve_object(
    db: Session,
    object_name: str,
    schema_name: Optional[str] = None,
    include_system: bool = True,
) -> Tuple[str, str, str, bool]:
    """Verify object exists in live catalog and return (name, schema, object_type, is_system)."""
    _validate_identifier(object_name, "table/view name")
    if schema_name and schema_name not in ("ALL", "aegis_main"):
        _validate_identifier(schema_name, "schema name")

    _, objects = _discover_catalog(db, include_system=include_system, schema_filter=schema_name)
    for obj in objects:
        if obj.name == object_name:
            return obj.name, obj.schema_name, obj.object_type, obj.is_system

    # Fallback search across all schemas if a specific schema wasn't matched
    if schema_name:
        _, all_objects = _discover_catalog(db, include_system=include_system)
        for obj in all_objects:
            if obj.name == object_name:
                return obj.name, obj.schema_name, obj.object_type, obj.is_system

    raise HTTPException(status_code=404, detail=f"Database object '{object_name}' does not exist")


@router.get("/schemas", response_model=List[SchemaInfo])
def get_schemas(
    include_system: bool = Query(False),
    db: Session = Depends(get_db),
):
    schemas_info, _ = _discover_catalog(db, include_system=include_system)
    return schemas_info


@router.get("/tables", response_model=List[TableSummary])
def get_tables(
    schema_name: str = Query("ALL"),
    include_system: bool = Query(False),
    object_type: str = Query("ALL"),
    db: Session = Depends(get_db),
):
    _, objects = _discover_catalog(db, include_system=include_system, schema_filter=schema_name)
    if object_type and object_type.upper() != "ALL":
        target_type = object_type.upper()
        objects = [o for o in objects if o.object_type == target_type]
    return objects


@router.get("/views", response_model=List[TableSummary])
def get_views(
    schema_name: str = Query("ALL"),
    db: Session = Depends(get_db),
):
    _, objects = _discover_catalog(db, include_system=False, schema_filter=schema_name)
    return [o for o in objects if o.object_type == "VIEW"]


@router.get("/overview", response_model=DbOverviewResponse)
def get_db_overview(
    include_system: bool = Query(False),
    db: Session = Depends(get_db),
):
    start_t = time.perf_counter()
    db.execute(text("SELECT 1")).scalar()
    latency_ms = round((time.perf_counter() - start_t) * 1000, 2)

    schemas_info, all_objects = _discover_catalog(db, include_system=include_system)

    tables_only = [o for o in all_objects if o.object_type == "TABLE"]
    views_only = [o for o in all_objects if o.object_type == "VIEW"]
    sys_only = [o for o in all_objects if o.object_type == "SYSTEM_TABLE"]

    total_records = sum(o.rows for o in tables_only)
    rels = get_relationships()

    recent_ops = []
    try:
        events = (
            db.query(SystemEvent)
            .filter(SystemEvent.module == "DB")
            .order_by(SystemEvent.timestamp.desc())
            .limit(8)
            .all()
        )
        for ev in events:
            recent_ops.append({
                "id": ev.id,
                "event": ev.event,
                "description": ev.description,
                "severity": ev.severity,
                "timestamp": ev.timestamp.isoformat() if ev.timestamp else "",
                "execution_id": ev.execution_id,
                "status": ev.status or "SUCCESS",
            })
    except Exception:
        pass

    db_name = os.path.basename(engine.url.database) if engine.url.database else "aegis.db"

    return DbOverviewResponse(
        database_name=db_name,
        dialect=engine.dialect.name.upper(),
        status="ONLINE",
        latency_ms=latency_ms,
        total_tables=len(tables_only),
        total_views=len(views_only),
        total_system_tables=len(sys_only),
        total_records=total_records,
        schemas=schemas_info,
        tables=tables_only,
        views=views_only,
        foreign_keys_count=len(rels),
        recent_operations=recent_ops,
        relationships=rels,
    )


@router.get("/relationships")
def get_relationships(schema_name: Optional[str] = Query(None)):
    inspector = inspect(engine)
    dialect_name = engine.dialect.name.lower()

    try:
        schemas = inspector.get_schema_names()
    except Exception:
        schemas = ["main"]

    if schema_name and schema_name not in ("ALL", "aegis_main"):
        schemas = [s for s in schemas if s == schema_name]
    else:
        schemas = [s for s in schemas if s.lower() not in SYSTEM_SCHEMAS]

    relationships: List[Dict[str, Any]] = []
    discovered_tables: set = set()

    for sch in schemas:
        sch_arg = None if (dialect_name == "sqlite" and sch == "main") else sch
        try:
            tbls = [t for t in inspector.get_table_names(schema=sch_arg) if not (dialect_name == "sqlite" and t.startswith("sqlite_"))]
        except Exception:
            continue

        for t_name in tbls:
            discovered_tables.add(t_name)
            try:
                fks = inspector.get_foreign_keys(t_name, schema=sch_arg)
                for fk in fks:
                    src_cols = fk.get("constrained_columns", [])
                    ref_cols = fk.get("referred_columns", [])
                    ref_tbl = fk.get("referred_table", "")
                    relationships.append({
                        "id": f"{t_name}.{src_cols[0] if src_cols else ''}->{ref_tbl}.{ref_cols[0] if ref_cols else ''}",
                        "schema_name": sch,
                        "source_table": t_name,
                        "source_column": ", ".join(src_cols),
                        "target_table": ref_tbl,
                        "target_column": ", ".join(ref_cols),
                        "type": "MANY_TO_ONE",
                        "cardinality": "N:1",
                        "constraint_name": fk.get("name") or f"fk_{t_name}_{ref_tbl}",
                        "is_physical": True,
                        "on_delete": fk.get("options", {}).get("ondelete", "NO ACTION"),
                        "description": f"Foreign key constraint referencing {ref_tbl}({', '.join(ref_cols)}).",
                    })
            except Exception:
                pass

    # Preserve existing AegisVault logical associations where both tables exist
    logical_relations = [
        ("audit_logs", "user_id", "users", "id", "Logs belong to registered operator or user accounts"),
        ("db_locks", "tx_id", "db_transactions", "id", "Database lock holds claim on active transaction"),
        ("memory_blocks", "process_id", "processes", "pid", "Memory allocation segment mapped to active process"),
        ("system_events", "execution_id", "executions", "id", "Telemetry system event emitted by execution run"),
    ]
    for src_t, src_c, tgt_t, tgt_c, desc in logical_relations:
        if src_t in discovered_tables and tgt_t in discovered_tables:
            rel_id = f"{src_t}.{src_c}->{tgt_t}.{tgt_c}"
            if not any(r["id"] == rel_id for r in relationships):
                relationships.append({
                    "id": rel_id,
                    "schema_name": schemas[0] if schemas else "main",
                    "source_table": src_t,
                    "source_column": src_c,
                    "target_table": tgt_t,
                    "target_column": tgt_c,
                    "type": "MANY_TO_ONE",
                    "cardinality": "N:1",
                    "constraint_name": f"rel_{src_t}_{tgt_t}",
                    "is_physical": False,
                    "on_delete": "LOGICAL",
                    "description": desc,
                })

    return relationships


@router.get("/tables/{table_name}/records", response_model=PaginatedRecordsResponse)
def get_table_records_paginated(
    table_name: str,
    schema_name: Optional[str] = Query(None),
    include_system: bool = Query(True),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: Optional[str] = Query(None),
    sort_by: Optional[str] = Query(None),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    filter_column: Optional[str] = Query(None),
    filter_value: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    obj_name, resolved_schema, obj_type, _ = _resolve_object(
        db, table_name, schema_name=schema_name, include_system=include_system
    )

    inspector = inspect(engine)
    dialect_name = engine.dialect.name.lower()
    sch_arg = None if (dialect_name == "sqlite" and resolved_schema == "main") else resolved_schema
    cols = [c["name"] for c in inspector.get_columns(obj_name, schema=sch_arg)]

    where_clauses = []
    params: Dict[str, Any] = {}

    if filter_column and filter_value is not None and filter_value != "":
        if filter_column not in cols:
            raise HTTPException(status_code=400, detail=f"Invalid filter column '{filter_column}'")
        where_clauses.append(f"{_quote_ident(filter_column)} LIKE :filt_val")
        params["filt_val"] = f"%{filter_value}%"

    if search and search.strip():
        cast_type = "CHAR" if dialect_name == "mysql" else "TEXT"
        search_terms = [f"CAST({_quote_ident(col)} AS {cast_type}) LIKE :search_term" for col in cols[:8]]
        params["search_term"] = f"%{search.strip()}%"
        if search_terms:
            where_clauses.append(f"({' OR '.join(search_terms)})")

    where_str = f" WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    qual_obj = _qualify_object(obj_name, resolved_schema)

    count_is_estimated = False
    if not where_clauses:
        total_count, count_is_estimated = _get_row_count(db, obj_name, resolved_schema, obj_type)
    else:
        count_sql = f"SELECT COUNT(*) FROM {qual_obj}{where_str}"
        total_count = int(db.execute(text(count_sql), params).scalar() or 0)

    order_clause = ""
    if sort_by:
        if sort_by not in cols:
            raise HTTPException(status_code=400, detail=f"Invalid sort column '{sort_by}'")
        direction = "DESC" if sort_order.lower() == "desc" else "ASC"
        order_clause = f" ORDER BY {_quote_ident(sort_by)} {direction}"
    elif obj_type == "TABLE":
        pk_constraint = inspector.get_pk_constraint(obj_name, schema=sch_arg)
        pk_cols = pk_constraint.get("constrained_columns", []) if pk_constraint else []
        if pk_cols:
            order_clause = f" ORDER BY {_quote_ident(pk_cols[0])} ASC"

    offset = (page - 1) * page_size
    params["lim"] = page_size
    params["off"] = offset

    select_sql = f"SELECT * FROM {qual_obj}{where_str}{order_clause} LIMIT :lim OFFSET :off"
    res = db.execute(text(select_sql), params)
    result_cols = list(res.keys())
    raw_rows = res.fetchall()

    rows = [dict(zip(result_cols, [str(v) if v is not None else None for v in r])) for r in raw_rows]
    total_pages = max(1, (total_count + page_size - 1) // page_size)

    return PaginatedRecordsResponse(
        table=obj_name,
        schema_name=resolved_schema,
        object_type=obj_type,
        columns=result_cols,
        rows=rows,
        total_count=total_count,
        count_is_estimated=count_is_estimated,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/tables/{table_name}/schema", response_model=TableSchemaResponse)
def get_table_schema(
    table_name: str,
    schema_name: Optional[str] = Query(None),
    include_system: bool = Query(True),
    db: Session = Depends(get_db),
):
    obj_name, resolved_schema, obj_type, is_sys = _resolve_object(
        db, table_name, schema_name=schema_name, include_system=include_system
    )

    inspector = inspect(engine)
    dialect_name = engine.dialect.name.lower()
    sch_arg = None if (dialect_name == "sqlite" and resolved_schema == "main") else resolved_schema

    cols = inspector.get_columns(obj_name, schema=sch_arg)
    primary_keys: List[str] = []
    if obj_type == "TABLE":
        try:
            pk_constraint = inspector.get_pk_constraint(obj_name, schema=sch_arg)
            primary_keys = pk_constraint.get("constrained_columns", []) if pk_constraint else []
        except Exception:
            primary_keys = []

    fk_infos: List[ForeignKeyInfo] = []
    if obj_type == "TABLE":
        try:
            for fk in inspector.get_foreign_keys(obj_name, schema=sch_arg):
                fk_infos.append(ForeignKeyInfo(
                    name=fk.get("name"),
                    constrained_columns=fk.get("constrained_columns", []),
                    referred_table=fk.get("referred_table", ""),
                    referred_columns=fk.get("referred_columns", []),
                    on_delete=fk.get("options", {}).get("ondelete"),
                ))
        except Exception:
            pass

    idx_infos: List[IndexInfo] = []
    if obj_type == "TABLE":
        try:
            for idx in inspector.get_indexes(obj_name, schema=sch_arg):
                idx_infos.append(IndexInfo(
                    name=idx.get("name", ""),
                    columns=idx.get("column_names", []),
                    unique=bool(idx.get("unique", False)),
                    dialect_options=idx.get("dialect_options", {}) or {},
                ))
        except Exception:
            pass

    constraints: List[Dict[str, Any]] = []
    if primary_keys:
        constraints.append({"type": "PRIMARY KEY", "columns": primary_keys, "name": f"pk_{obj_name}"})
    for fk in fk_infos:
        constraints.append({
            "type": "FOREIGN KEY",
            "columns": fk.constrained_columns,
            "name": fk.name or f"fk_{obj_name}_{fk.referred_table}",
            "references": f"{fk.referred_table}({', '.join(fk.referred_columns)})",
        })
    try:
        for uq in inspector.get_unique_constraints(obj_name, schema=sch_arg):
            constraints.append({
                "type": "UNIQUE",
                "columns": uq.get("column_names", []),
                "name": uq.get("name") or "uq_constraint",
            })
    except Exception:
        pass
    try:
        for ck in inspector.get_check_constraints(obj_name, schema=sch_arg):
            constraints.append({
                "type": "CHECK",
                "expression": ck.get("sqltext", ""),
                "name": ck.get("name") or "ck_constraint",
            })
    except Exception:
        pass

    fk_col_set = {c for fk in fk_infos for c in fk.constrained_columns}
    column_infos: List[ColumnInfo] = []
    for c in cols:
        col_constraints = []
        if c["name"] in primary_keys:
            col_constraints.append("PRIMARY KEY")
        if c["name"] in fk_col_set:
            col_constraints.append("FOREIGN KEY")
        if not bool(c.get("nullable", True)):
            col_constraints.append("NOT NULL")
        column_infos.append(ColumnInfo(
            name=c["name"],
            type=str(c["type"]),
            nullable=bool(c.get("nullable", True)),
            primary_key=c["name"] in primary_keys,
            default=str(c.get("default")) if c.get("default") is not None else None,
            constraints=col_constraints,
        ))

    view_def = None
    if obj_type == "VIEW":
        try:
            view_def = inspector.get_view_definition(obj_name, schema=sch_arg)
        except Exception:
            view_def = None

    relationships = [
        {
            "source_column": ", ".join(fk.constrained_columns),
            "target_table": fk.referred_table,
            "target_column": ", ".join(fk.referred_columns),
            "type": "MANY_TO_ONE",
        }
        for fk in fk_infos
    ]

    row_count, count_is_estimated = _get_row_count(db, obj_name, resolved_schema, obj_type)
    size_bytes = 0 if obj_type == "VIEW" else row_count * 256
    size_formatted = "VIEW (VIRTUAL)" if obj_type == "VIEW" else (
        f"{size_bytes} Bytes" if size_bytes < 1024 else f"{round(size_bytes / 1024, 1)} KB"
    )

    return TableSchemaResponse(
        table_name=obj_name,
        schema_name=resolved_schema,
        object_type=obj_type,
        is_system=is_sys,
        view_definition=view_def,
        columns=column_infos,
        primary_keys=primary_keys,
        foreign_keys=fk_infos,
        indexes=idx_infos,
        constraints=constraints,
        relationships=relationships,
        row_count=row_count,
        count_is_estimated=count_is_estimated,
        size_bytes=size_bytes,
        size_formatted=size_formatted,
    )


@router.get("/tables/{table_name}/rows")
def get_table_rows(
    table_name: str,
    schema_name: Optional[str] = Query(None),
    limit: int = Query(25, le=100),
    db: Session = Depends(get_db),
):
    obj_name, resolved_schema, _, _ = _resolve_object(db, table_name, schema_name=schema_name, include_system=True)
    qual_obj = _qualify_object(obj_name, resolved_schema)
    res = db.execute(text(f"SELECT * FROM {qual_obj} LIMIT :lim"), {"lim": limit})
    columns = list(res.keys())
    rows = [dict(zip(columns, row)) for row in res.fetchall()]
    return {
        "table": obj_name,
        "schema_name": resolved_schema,
        "columns": columns,
        "rows": rows,
        "count": len(rows),
    }


def _db_error_response(collector: TraceCollector, op: str, table_name: str, error_msg: str) -> DbOperationResponse:
    collector.emit(
        simulation_time=collector.events[-1].simulation_time + 0.1 if collector.events else 0.5,
        operation=f"{op.lower()}_fault",
        entity="SAFETY_CONTROLLER",
        action="abort",
        reason=f"Operation rejected: {error_msg}",
        explanation=f"Integrity check failed: {error_msg}. Active operation terminated safely without altering table state.",
        calculation={"error": error_msg},
        state_before={"status": "PROCESSING"},
        state_after={"status": "REJECTED", "error": error_msg},
        affected_entities=[table_name],
        status="REJECTED",
        next_step="Halt execution",
    )
    return DbOperationResponse(
        success=False,
        operation=op,
        table=table_name,
        error=error_msg,
        execution_id=collector.execution_id,
        trace_events=collector.get_events(),
    )


def _persist_db_execution(db: Session, collector: TraceCollector, operation: str, table_name: str, input_data: Any, result_data: Any):
    try:
        exec_model = ExecutionModel(
            id=collector.execution_id,
            module="dbms",
            algorithm=operation,
            status="COMPLETED",
            input_data={"table": table_name, "details": input_data},
            result_data=result_data,
            summary_metrics={"operation": operation, "table": table_name, "steps": len(collector.get_events())},
            trace_events=collector.get_events_dict(),
            total_steps=len(collector.get_events()),
        )
        db.add(exec_model)

        event = SystemEvent(
            module="DB",
            event=f"DB_{operation}",
            severity="INFO",
            description=f"Executed {operation} on '{table_name}' [Exec ID: {collector.execution_id}]",
            execution_id=collector.execution_id,
            step_number=len(collector.get_events()),
            status="SUCCESS",
            entity=table_name,
        )
        db.add(event)
        db.commit()
    except Exception:
        db.rollback()


@router.post("/operations/execute", response_model=DbOperationResponse)
def execute_db_operation(req: DbOperationRequest, db: Session = Depends(get_db)):
    op = req.operation.upper().strip()
    table_name = req.table.strip()

    if op not in ["SELECT", "INSERT", "UPDATE", "DELETE"]:
        raise HTTPException(status_code=400, detail=f"Unsupported operation '{op}'")

    collector = TraceCollector(module="dbms")
    start_time = time.perf_counter()

    collector.emit(
        simulation_time=0.1,
        operation=f"db_{op.lower()}_request",
        entity="REQUEST_DISPATCHER",
        action="receive_request",
        reason=f"Received structured {op} operation request for '{table_name}'.",
        explanation=f"Incoming operation dispatch: action={op}, target={table_name}. Beginning validation.",
        calculation={"operation": op, "target_table": table_name, "has_data": bool(req.data)},
        state_before={"status": "INITIALIZING"},
        state_after={"status": "RECEIVED", "operation": op, "table": table_name},
        affected_entities=[table_name],
        next_step="Validate identifier and resolve catalog object",
    )

    if not VALID_IDENT_RE.match(table_name):
        return _db_error_response(collector, op, table_name, f"Invalid database identifier '{table_name}'.")

    try:
        obj_name, resolved_schema, obj_type, is_sys = _resolve_object(
            db, table_name, schema_name=req.schema_name, include_system=True
        )
    except HTTPException as exc:
        collector.emit(
            simulation_time=0.2,
            operation="catalog_validation",
            entity="CATALOG_MANAGER",
            action="reject",
            reason=f"Object '{table_name}' does not exist in schema catalog.",
            explanation=exc.detail,
            calculation={"target": table_name},
            state_before={"table_resolved": False},
            state_after={"error": "OBJECT_NOT_FOUND"},
            affected_entities=["CATALOG"],
            status="ERROR",
            next_step="Abort operation",
        )
        return DbOperationResponse(
            success=False,
            operation=op,
            table=table_name,
            error=f"Object '{table_name}' does not exist in database catalog.",
            execution_id=collector.execution_id,
            trace_events=collector.get_events(),
        )

    if obj_type in ("VIEW", "SYSTEM_TABLE") and op in ("INSERT", "UPDATE", "DELETE"):
        return _db_error_response(
            collector,
            op,
            obj_name,
            f"Write operation '{op}' is disallowed on {obj_type} '{obj_name}' (read-only object).",
        )

    inspector = inspect(engine)
    dialect_name = engine.dialect.name.lower()
    sch_arg = None if (dialect_name == "sqlite" and resolved_schema == "main") else resolved_schema
    cols_meta = inspector.get_columns(obj_name, schema=sch_arg)
    col_names = [c["name"] for c in cols_meta]
    pk_cols: List[str] = []
    fks_meta: List[Dict[str, Any]] = []
    if obj_type == "TABLE":
        pk_constraint = inspector.get_pk_constraint(obj_name, schema=sch_arg)
        pk_cols = pk_constraint.get("constrained_columns", []) if pk_constraint else []
        fks_meta = inspector.get_foreign_keys(obj_name, schema=sch_arg)

    qual_obj = _qualify_object(obj_name, resolved_schema)

    collector.emit(
        simulation_time=0.3,
        operation="schema_resolution",
        entity="CATALOG_MANAGER",
        action="resolve_schema",
        reason=f"Verified {obj_type} '{obj_name}' in schema '{resolved_schema}'. Columns: {len(col_names)}.",
        explanation=f"Metadata introspection retrieved {len(col_names)} columns and {len(fks_meta)} foreign key constraint(s).",
        calculation={"columns": col_names, "primary_keys": pk_cols, "object_type": obj_type},
        state_before={"table_resolved": False},
        state_after={"table_resolved": True, "column_count": len(col_names)},
        affected_entities=[obj_name],
        next_step="Inspect input payload and validate constraints",
    )

    # SELECT OPERATION
    if op == "SELECT":
        where_clauses = []
        params: Dict[str, Any] = {}
        if req.filter_column and req.filter_value is not None and str(req.filter_value).strip() != "":
            if req.filter_column not in col_names:
                return _db_error_response(collector, op, obj_name, f"Filter column '{req.filter_column}' not found in '{obj_name}'.")
            op_sym = "="
            if req.filter_operator in ["=", "!=", ">", "<", ">=", "<="]:
                op_sym = req.filter_operator
                params["fval"] = req.filter_value
            elif req.filter_operator == "LIKE":
                op_sym = "LIKE"
                params["fval"] = f"%{req.filter_value}%"
            else:
                params["fval"] = req.filter_value
            where_clauses.append(f"{_quote_ident(req.filter_column)} {op_sym} :fval")

        where_str = f" WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        collector.emit(
            simulation_time=0.4,
            operation="where_evaluation",
            entity="QUERY_OPTIMIZER",
            action="evaluate_predicate",
            reason=f"Constructed predicate filter: {where_str or 'NO_FILTER (Full Scan)'}.",
            explanation="Query optimizer parsed filter criteria into parameterized predicate conditions.",
            calculation={"filter_column": req.filter_column, "operator": req.filter_operator or "=", "filter_value": req.filter_value},
            state_before={"filter_evaluated": False},
            state_after={"filter_evaluated": True, "where_clause": where_str or "NONE"},
            affected_entities=[obj_name],
            next_step="Count matching rows",
        )

        count_res = int(db.execute(text(f"SELECT COUNT(*) FROM {qual_obj}{where_str}"), params).scalar() or 0)
        collector.emit(
            simulation_time=0.5,
            operation="cardinality_estimation",
            entity="STATISTICS_ENGINE",
            action="estimate_rows",
            reason=f"Found {count_res} matching record(s) in '{obj_name}'.",
            explanation=f"Evaluated cardinality against predicate: {count_res} rows qualify.",
            calculation={"matching_rows": count_res, "table": obj_name},
            state_before={"estimated_rows": None},
            state_after={"estimated_rows": count_res},
            affected_entities=[obj_name],
            next_step="Execute parameterized SELECT",
        )

        order_clause = ""
        if req.order_by:
            if req.order_by not in col_names:
                return _db_error_response(collector, op, obj_name, f"Order column '{req.order_by}' not found.")
            direction = "DESC" if req.order_dir and req.order_dir.upper() == "DESC" else "ASC"
            order_clause = f" ORDER BY {_quote_ident(req.order_by)} {direction}"
        elif pk_cols:
            order_clause = f" ORDER BY {_quote_ident(pk_cols[0])} ASC"

        lim = min(req.limit or 25, 100)
        params["lim"] = lim
        query_sql = f"SELECT * FROM {qual_obj}{where_str}{order_clause} LIMIT :lim"

        res = db.execute(text(query_sql), params)
        res_cols = list(res.keys())
        raw_rows = res.fetchall()
        rows = [dict(zip(res_cols, [str(v) if v is not None else None for v in r])) for r in raw_rows]
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        collector.emit(
            simulation_time=0.6,
            operation="query_execution",
            entity="DATABASE_ENGINE",
            action="execute_query",
            reason=f"Executed SELECT in {duration_ms} ms. Returned {len(rows)} row(s).",
            explanation=f"Fetched {len(rows)} of {count_res} total qualifying records.",
            calculation={"duration_ms": duration_ms, "returned_rows": len(rows), "limit": lim},
            state_before={"execution_status": "PENDING"},
            state_after={"execution_status": "COMPLETED", "rows_count": len(rows)},
            affected_entities=[obj_name],
            next_step="Finalize trace",
        )
        collector.emit(
            simulation_time=0.7,
            operation="operation_complete",
            entity="SESSION_MANAGER",
            action="finalize",
            reason="SELECT operation finished successfully.",
            explanation="Result set serialized into structured response.",
            calculation={"total_count": count_res, "returned_count": len(rows)},
            state_before={"finalized": False},
            state_after={"finalized": True},
            affected_entities=[obj_name],
            status="SUCCESS",
            next_step="Deliver response",
        )

        _persist_db_execution(db, collector, "SELECT", obj_name, {"filter": req.filter_column}, {"rows": len(rows), "total": count_res})
        return DbOperationResponse(
            success=True,
            operation="SELECT",
            table=obj_name,
            message=f"Retrieved {len(rows)} records from '{obj_name}' (Total matching: {count_res}).",
            affected_rows=len(rows),
            columns=res_cols,
            rows=rows,
            duration_ms=duration_ms,
            execution_id=collector.execution_id,
            trace_events=collector.get_events(),
        )

    # INSERT OPERATION
    elif op == "INSERT":
        data = req.data or {}
        if not data:
            return _db_error_response(collector, op, obj_name, "No data payload provided for INSERT operation.")

        for k in data.keys():
            if k not in col_names:
                return _db_error_response(collector, op, obj_name, f"Column '{k}' does not exist in table '{obj_name}'.")

        for col in cols_meta:
            cname = col["name"]
            if not col["nullable"] and col.get("default") is None and not col.get("primary_key", False):
                if cname not in data or data[cname] is None or str(data[cname]).strip() == "":
                    return _db_error_response(collector, op, obj_name, f"Field '{cname}' is required (NOT NULL) and cannot be empty.")

        collector.emit(
            simulation_time=0.4,
            operation="input_validation",
            entity="SCHEMA_VALIDATOR",
            action="validate_fields",
            reason="All payload fields matched schema definitions and nullability rules.",
            explanation=f"Validated {len(data)} fields against schema.",
            calculation={"fields": list(data.keys())},
            state_before={"payload_validated": False},
            state_after={"payload_validated": True},
            affected_entities=[obj_name],
            next_step="Check primary & foreign key constraints",
        )

        for pk in pk_cols:
            if pk in data and data[pk] is not None and str(data[pk]).strip() != "":
                exists_cnt = db.execute(
                    text(f"SELECT COUNT(*) FROM {qual_obj} WHERE {_quote_ident(pk)} = :pk_val"),
                    {"pk_val": data[pk]},
                ).scalar() or 0
                if exists_cnt > 0:
                    return _db_error_response(collector, op, obj_name, f"Primary key violation: {pk}='{data[pk]}' already exists in '{obj_name}'.")

        for fk in fks_meta:
            ref_tbl = fk.get("referred_table")
            src_cols = fk.get("constrained_columns", [])
            ref_cols = fk.get("referred_columns", [])
            if src_cols and ref_cols and ref_tbl:
                src_col, ref_col = src_cols[0], ref_cols[0]
                if src_col in data and data[src_col] is not None and str(data[src_col]).strip() != "":
                    fk_exists = db.execute(
                        text(f"SELECT COUNT(*) FROM {_quote_ident(ref_tbl)} WHERE {_quote_ident(ref_col)} = :fk_val"),
                        {"fk_val": data[src_col]},
                    ).scalar() or 0
                    if fk_exists == 0:
                        return _db_error_response(collector, op, obj_name, f"Foreign key constraint violation: referenced {ref_tbl}.{ref_col}='{data[src_col]}' does not exist.")

        collector.emit(
            simulation_time=0.5,
            operation="constraint_verification",
            entity="CONSTRAINT_ENGINE",
            action="verify_integrity",
            reason="Foreign key and unique primary key constraints verified.",
            explanation=f"Checked {len(fks_meta)} foreign keys and primary keys.",
            calculation={"checked_fks": len(fks_meta), "checked_pks": len(pk_cols)},
            state_before={"integrity_verified": False},
            state_after={"integrity_verified": True},
            affected_entities=[obj_name],
            next_step="Execute parameterized INSERT",
        )

        clean_data = {
            k: v for k, v in data.items()
            if not (k in pk_cols and (v is None or str(v).strip() == ""))
        }
        insert_cols = list(clean_data.keys())
        quoted_cols = [_quote_ident(c) for c in insert_cols]
        placeholders = [f":val_{i}" for i in range(len(insert_cols))]
        params = {f"val_{i}": clean_data[c] for i, c in enumerate(insert_cols)}
        insert_sql = f"INSERT INTO {qual_obj} ({', '.join(quoted_cols)}) VALUES ({', '.join(placeholders)})"

        try:
            db.execute(text(insert_sql), params)
            collector.emit(
                simulation_time=0.6,
                operation="insert_execution",
                entity="DATABASE_ENGINE",
                action="execute_insert",
                reason=f"Executed parameterized INSERT on '{obj_name}'.",
                explanation="New row written to storage buffer.",
                calculation={"fields": insert_cols},
                state_before={"row_inserted": False},
                state_after={"row_inserted": True},
                affected_entities=[obj_name],
                next_step="Commit transaction",
            )
            db.commit()
            collector.emit(
                simulation_time=0.7,
                operation="transaction_commit",
                entity="TRANSACTION_MANAGER",
                action="commit",
                reason="Transaction committed successfully.",
                explanation="Changes persisted for ACID durability.",
                calculation={"committed": True},
                state_before={"transaction_active": True},
                state_after={"transaction_active": False, "committed": True},
                affected_entities=[obj_name],
                status="SUCCESS",
                next_step="Finalize",
            )
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            _persist_db_execution(db, collector, "INSERT", obj_name, clean_data, {"status": "SUCCESS", "rows_affected": 1})
            return DbOperationResponse(
                success=True,
                operation="INSERT",
                table=obj_name,
                message=f"Successfully inserted 1 record into '{obj_name}'.",
                affected_rows=1,
                columns=insert_cols,
                rows=[clean_data],
                state_before=None,
                state_after=clean_data,
                duration_ms=duration_ms,
                execution_id=collector.execution_id,
                trace_events=collector.get_events(),
            )
        except Exception as e:
            db.rollback()
            return _db_error_response(collector, op, obj_name, f"Engine execution failure: {str(e)}")

    # UPDATE OPERATION
    elif op == "UPDATE":
        data = req.data or {}
        if not data:
            return _db_error_response(collector, op, obj_name, "No update fields provided.")
        if not req.filter_column or req.filter_value is None or str(req.filter_value).strip() == "":
            return _db_error_response(collector, op, obj_name, "UPDATE requires a target filter condition.")
        if req.filter_column not in col_names:
            return _db_error_response(collector, op, obj_name, f"Target filter column '{req.filter_column}' not found.")
        for k in data.keys():
            if k not in col_names:
                return _db_error_response(collector, op, obj_name, f"Update column '{k}' does not exist in '{obj_name}'.")

        where_sql = f"WHERE {_quote_ident(req.filter_column)} = :filter_val"
        params = {"filter_val": req.filter_value}
        collector.emit(
            simulation_time=0.4,
            operation="where_evaluation",
            entity="QUERY_OPTIMIZER",
            action="evaluate_predicate",
            reason=f"Target predicate evaluated: {req.filter_column} = {req.filter_value}.",
            explanation="Resolved target constraint.",
            calculation={"filter_column": req.filter_column, "filter_value": req.filter_value},
            state_before={"predicate_evaluated": False},
            state_after={"predicate_evaluated": True},
            affected_entities=[obj_name],
            next_step="Capture state before update",
        )
        pre_res = db.execute(text(f"SELECT * FROM {qual_obj} {where_sql} LIMIT 1"), params)
        pre_keys = list(pre_res.keys())
        pre_row = pre_res.fetchone()
        if not pre_row:
            return _db_error_response(collector, op, obj_name, f"No record found matching {req.filter_column} = {req.filter_value}.")

        state_before = dict(zip(pre_keys, [str(v) if v is not None else None for v in pre_row]))
        collector.emit(
            simulation_time=0.5,
            operation="state_before_capture",
            entity="DATA_OBSERVER",
            action="read_before",
            reason=f"Captured pre-update state ({req.filter_column}={req.filter_value}).",
            explanation="Retrieved target row before mutation.",
            calculation={"matched_record": state_before},
            state_before=state_before,
            state_after={"state_captured": True},
            affected_entities=[obj_name],
            next_step="Execute parameterized UPDATE",
        )
        set_clauses = []
        for idx, k in enumerate(data.keys()):
            set_clauses.append(f"{_quote_ident(k)} = :val_{idx}")
            params[f"val_{idx}"] = data[k]

        update_sql = f"UPDATE {qual_obj} SET {', '.join(set_clauses)} {where_sql}"
        try:
            res_update = db.execute(text(update_sql), params)
            affected = res_update.rowcount
            collector.emit(
                simulation_time=0.6,
                operation="update_execution",
                entity="DATABASE_ENGINE",
                action="execute_update",
                reason=f"Updated {affected} row(s) in '{obj_name}'.",
                explanation="Executed parameterized UPDATE.",
                calculation={"rows_affected": affected, "updated_fields": list(data.keys())},
                state_before={"updated": False},
                state_after={"updated": True, "rows_affected": affected},
                affected_entities=[obj_name],
                next_step="Commit transaction",
            )
            db.commit()
            collector.emit(
                simulation_time=0.65,
                operation="transaction_commit",
                entity="TRANSACTION_MANAGER",
                action="commit",
                reason="Committed UPDATE transaction.",
                explanation="Write operations synced to disk storage.",
                calculation={"committed": True},
                state_before={"transaction_active": True},
                state_after={"transaction_active": False, "committed": True},
                affected_entities=[obj_name],
                next_step="Capture state after mutation",
            )
            post_res = db.execute(text(f"SELECT * FROM {qual_obj} {where_sql} LIMIT 1"), {"filter_val": req.filter_value})
            post_keys = list(post_res.keys())
            post_row = post_res.fetchone()
            state_after = dict(zip(post_keys, [str(v) if v is not None else None for v in post_row])) if post_row else {}

            collector.emit(
                simulation_time=0.7,
                operation="state_after_capture",
                entity="DATA_OBSERVER",
                action="read_after",
                reason=f"Captured post-update state for '{obj_name}'.",
                explanation="State after update confirmed.",
                calculation={"before": state_before, "after": state_after},
                state_before=state_before,
                state_after=state_after,
                affected_entities=[obj_name],
                status="SUCCESS",
                next_step="Finalize",
            )
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            _persist_db_execution(db, collector, "UPDATE", obj_name, {"filter": req.filter_column}, {"rows_affected": affected})
            return DbOperationResponse(
                success=True,
                operation="UPDATE",
                table=obj_name,
                message=f"Successfully updated record in '{obj_name}' where {req.filter_column}='{req.filter_value}'.",
                affected_rows=affected,
                columns=list(state_after.keys()),
                rows=[state_after],
                state_before=state_before,
                state_after=state_after,
                duration_ms=duration_ms,
                execution_id=collector.execution_id,
                trace_events=collector.get_events(),
            )
        except Exception as e:
            db.rollback()
            return _db_error_response(collector, op, obj_name, f"Engine execution failure: {str(e)}")

    # DELETE OPERATION
    else:
        if not req.filter_column or req.filter_value is None or str(req.filter_value).strip() == "":
            return _db_error_response(collector, op, obj_name, "DELETE requires a specific target filter condition.")
        if req.filter_column not in col_names:
            return _db_error_response(collector, op, obj_name, f"Target filter column '{req.filter_column}' not found.")

        where_sql = f"WHERE {_quote_ident(req.filter_column)} = :filter_val"
        params = {"filter_val": req.filter_value}
        collector.emit(
            simulation_time=0.4,
            operation="where_evaluation",
            entity="QUERY_OPTIMIZER",
            action="evaluate_predicate",
            reason=f"Target predicate evaluated: {req.filter_column} = {req.filter_value}.",
            explanation="Safety guard ensured DELETE is scoped to targeted predicate.",
            calculation={"filter_column": req.filter_column, "filter_value": req.filter_value},
            state_before={"predicate_evaluated": False},
            state_after={"predicate_evaluated": True},
            affected_entities=[obj_name],
            next_step="Capture target record before deletion",
        )
        pre_res = db.execute(text(f"SELECT * FROM {qual_obj} {where_sql} LIMIT 1"), params)
        pre_keys = list(pre_res.keys())
        pre_row = pre_res.fetchone()
        if not pre_row:
            return _db_error_response(collector, op, obj_name, f"No record found matching {req.filter_column} = {req.filter_value}.")

        state_before = dict(zip(pre_keys, [str(v) if v is not None else None for v in pre_row]))
        collector.emit(
            simulation_time=0.5,
            operation="state_before_capture",
            entity="DATA_OBSERVER",
            action="read_before",
            reason=f"Retrieved target record ({req.filter_column}={req.filter_value}) prior to deletion.",
            explanation="Audited pre-deletion state.",
            calculation={"record_to_delete": state_before},
            state_before=state_before,
            state_after={"recorded_for_deletion": True},
            affected_entities=[obj_name],
            next_step="Inspect referential integrity constraints",
        )

        all_tbls = inspector.get_table_names(schema=sch_arg)
        for other_tbl in all_tbls:
            if other_tbl == obj_name:
                continue
            try:
                for fk in inspector.get_foreign_keys(other_tbl, schema=sch_arg):
                    if fk.get("referred_table") == obj_name:
                        src_col = fk.get("constrained_columns", [None])[0]
                        ref_col = fk.get("referred_columns", [None])[0]
                        if ref_col == req.filter_column and src_col:
                            dep_cnt = db.execute(
                                text(f"SELECT COUNT(*) FROM {_quote_ident(other_tbl)} WHERE {_quote_ident(src_col)} = :fval"),
                                {"fval": req.filter_value},
                            ).scalar() or 0
                            if dep_cnt > 0:
                                return _db_error_response(
                                    collector, op, obj_name,
                                    f"Foreign key constraint violation: {dep_cnt} row(s) in '{other_tbl}' reference this record.",
                                )
            except Exception:
                pass

        collector.emit(
            simulation_time=0.6,
            operation="referential_integrity_check",
            entity="CONSTRAINT_ENGINE",
            action="verify_foreign_references",
            reason="Referential integrity verified.",
            explanation="Checked foreign key dependencies across catalog tables.",
            calculation={"referencing_tables_checked": len(all_tbls)},
            state_before={"dependencies_checked": False},
            state_after={"dependencies_checked": True},
            affected_entities=[obj_name],
            next_step="Execute DELETE",
        )

        try:
            del_res = db.execute(text(f"DELETE FROM {qual_obj} {where_sql}"), params)
            affected = del_res.rowcount
            db.commit()
            collector.emit(
                simulation_time=0.65,
                operation="transaction_commit",
                entity="TRANSACTION_MANAGER",
                action="commit",
                reason="Committed DELETE transaction.",
                explanation="Transaction manager marked page updates durable.",
                calculation={"committed": True},
                state_before={"transaction_active": True},
                state_after={"transaction_active": False, "committed": True},
                affected_entities=[obj_name],
                next_step="Finalize deletion",
            )
            collector.emit(
                simulation_time=0.7,
                operation="delete_execution",
                entity="DATABASE_ENGINE",
                action="execute_delete",
                reason=f"Deleted {affected} row(s) from '{obj_name}'.",
                explanation=f"Committed parameterized DELETE on {obj_name}.",
                calculation={"rows_removed": affected},
                state_before=state_before,
                state_after={"deleted": True},
                affected_entities=[obj_name],
                status="SUCCESS",
                next_step="Finalize",
            )
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            _persist_db_execution(db, collector, "DELETE", obj_name, {"filter": req.filter_column}, {"rows_affected": affected})
            return DbOperationResponse(
                success=True,
                operation="DELETE",
                table=obj_name,
                message=f"Successfully deleted 1 record from '{obj_name}' where {req.filter_column}='{req.filter_value}'.",
                affected_rows=affected,
                columns=list(state_before.keys()),
                rows=[],
                state_before=state_before,
                state_after=None,
                duration_ms=duration_ms,
                execution_id=collector.execution_id,
                trace_events=collector.get_events(),
            )
        except Exception as e:
            db.rollback()
            return _db_error_response(collector, op, obj_name, f"Engine execution failure: {str(e)}")


@router.post("/sql", response_model=SqlExecuteResponse)
def execute_sql(payload: SqlExecuteRequest, db: Session = Depends(get_db)):
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    collector = TraceCollector(module="sql_console")
    first_word = query.split()[0].upper() if query.split() else "UNKNOWN"
    classification = first_word if first_word in ["SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER", "EXPLAIN", "SHOW"] else "OTHER"

    collector.emit(
        simulation_time=0.1,
        operation="query_parse",
        entity="QUERY_PARSER",
        action="classify",
        reason=f"Parsed SQL statement classified as '{classification}'.",
        explanation=f"Statement starts with '{first_word}'.",
        calculation={"classification": classification},
        state_before={"query": query},
        state_after={"classification": classification},
        affected_entities=["SQL_PARSER"],
        next_step="Security check",
    )

    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, query, re.IGNORECASE):
            collector.emit(
                simulation_time=0.2,
                operation="security_check",
                entity="SECURITY_GATEWAY",
                action="reject",
                reason=f"Security Violation: Query matched blocked pattern '{pattern}'.",
                explanation="Blocked restricted statement.",
                calculation={"pattern": pattern},
                state_before={"authorized": False},
                state_after={"error": "PERMISSION_DENIED"},
                affected_entities=["SECURITY"],
                status="REJECTED",
                next_step="Halt",
            )
            return SqlExecuteResponse(
                success=False,
                columns=[],
                rows=[],
                row_count=0,
                duration_ms=0.0,
                error=f"Security Violation: Statement contains restricted syntax matching '{pattern}'.",
                query_classification=classification,
                logical_plan=[],
                execution_id=collector.execution_id,
                trace_events=collector.get_events(),
            )

    collector.emit(
        simulation_time=0.2,
        operation="security_check",
        entity="SECURITY_GATEWAY",
        action="validated",
        reason="Security gateway approved query.",
        explanation="No blocked PRAGMA or dangerous engine commands detected.",
        calculation={"blocked_patterns_checked": len(BLOCKED_PATTERNS), "passed": True},
        state_before={"authorized": False},
        state_after={"authorized": True},
        affected_entities=["SECURITY"],
        next_step="Resolve referenced database objects",
    )

    inspector = inspect(engine)
    all_known_objects = inspector.get_table_names() + inspector.get_view_names()
    referenced_tables = [t for t in all_known_objects if re.search(rf"\b{re.escape(t)}\b", query, re.IGNORECASE)]

    collector.emit(
        simulation_time=0.3,
        operation="schema_resolution",
        entity="CATALOG_MANAGER",
        action="resolve_tables",
        reason=f"Resolved referenced objects: {referenced_tables if referenced_tables else 'Engine-level'}.",
        explanation=f"Catalog introspection identified {len(all_known_objects)} tables/views.",
        calculation={"referenced_tables": referenced_tables},
        state_before={"resolved_tables": []},
        state_after={"resolved_tables": referenced_tables},
        affected_entities=referenced_tables or ["CATALOG"],
        next_step="Execute SQL statement",
    )

    logical_plan = [
        LogicalPlanStep(step=1, operation="QUERY_PARSE", target="QUERY", details=f"Classified statement as {classification}"),
        LogicalPlanStep(step=2, operation="SECURITY_VERIFY", target="GATEWAY", details="Passed sandbox syntax constraints"),
        LogicalPlanStep(step=3, operation="SCHEMA_RESOLVE", target=", ".join(referenced_tables) or "METADATA", details="Resolved catalog objects"),
        LogicalPlanStep(step=4, operation="EXECUTION", target="SQL_ENGINE", details="Execute statement on database engine"),
    ]

    start_time = time.perf_counter()
    try:
        result_proxy = db.execute(text(query))
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        if result_proxy.returns_rows:
            columns = list(result_proxy.keys())
            rows_raw = result_proxy.fetchmany(100)
            rows = [dict(zip(columns, [str(v) if v is not None else "NULL" for v in r])) for r in rows_raw]
            row_count = len(rows)
            msg = f"Query executed successfully in {duration_ms} ms. Returned {row_count} rows."
        else:
            db.commit()
            columns = ["status", "rows_affected"]
            rows = [{"status": "SUCCESS", "rows_affected": result_proxy.rowcount}]
            row_count = result_proxy.rowcount
            msg = f"Query executed successfully in {duration_ms} ms. {row_count} rows affected."

        collector.emit(
            simulation_time=0.4 + (duration_ms / 1000.0),
            operation="query_execution",
            entity=referenced_tables[0] if referenced_tables else "DATABASE",
            action="executed",
            reason=f"Executed {classification} in {duration_ms} ms ({row_count} rows).",
            explanation="Physical execution completed.",
            calculation={"duration_ms": duration_ms, "rows_affected": row_count},
            state_before={"execution_status": "PENDING"},
            state_after={"execution_status": "SUCCESS", "row_count": row_count},
            affected_entities=referenced_tables or ["DATABASE"],
            next_step="Render result set",
        )

        db.add(ExecutionModel(
            id=collector.execution_id,
            module="sql_console",
            algorithm=classification,
            status="COMPLETED",
            input_data={"query": query, "schema": payload.schema_name},
            result_data={"columns": columns, "row_count": row_count, "duration_ms": duration_ms},
            summary_metrics={"row_count": row_count, "duration_ms": duration_ms, "classification": classification},
            trace_events=collector.get_events_dict(),
            total_steps=len(collector.get_events()),
        ))
        db.add(SystemEvent(
            module="DB",
            event="SQL_EXECUTE",
            severity="INFO",
            description=f"Executed query: {query[:60]}... ({duration_ms}ms) [Exec ID: {collector.execution_id}]",
        ))
        db.commit()

        return SqlExecuteResponse(
            success=True,
            columns=columns,
            rows=rows,
            row_count=row_count,
            duration_ms=duration_ms,
            message=msg,
            query_classification=classification,
            logical_plan=logical_plan,
            execution_id=collector.execution_id,
            trace_events=collector.get_events(),
        )
    except Exception as e:
        db.rollback()
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        collector.emit(
            simulation_time=0.4 + (duration_ms / 1000.0),
            operation="query_execution",
            entity="DATABASE",
            action="error",
            reason=f"Database execution error: {str(e)}",
            explanation="Transaction rolled back.",
            calculation={"error": str(e)},
            state_before={"execution_status": "PENDING"},
            state_after={"execution_status": "FAILED", "error": str(e)},
            affected_entities=["DATABASE"],
            status="ERROR",
            next_step="Report error",
        )
        return SqlExecuteResponse(
            success=False,
            columns=[],
            rows=[],
            row_count=0,
            duration_ms=duration_ms,
            error=str(e),
            query_classification=classification,
            logical_plan=logical_plan,
            execution_id=collector.execution_id,
            trace_events=collector.get_events(),
        )
