from pydantic import BaseModel, ConfigDict
from typing import List, Dict, Any, Optional
from app.schemas.trace import TraceEvent

class SqlExecuteRequest(BaseModel):
    query: str
    schema_name: Optional[str] = "main"

class LogicalPlanStep(BaseModel):
    step: int
    operation: str
    target: str
    details: str

class SqlExecuteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    success: bool
    columns: List[str]
    rows: List[Dict[str, Any]]
    row_count: int
    duration_ms: float
    message: Optional[str] = None
    error: Optional[str] = None
    query_classification: Optional[str] = None
    logical_plan: List[LogicalPlanStep] = []
    execution_id: Optional[str] = None
    trace_events: List[TraceEvent] = []

class ColumnInfo(BaseModel):
    name: str
    type: str
    nullable: bool
    primary_key: bool
    default: Optional[str] = None
    constraints: List[str] = []

class ForeignKeyInfo(BaseModel):
    name: Optional[str] = None
    constrained_columns: List[str]
    referred_table: str
    referred_columns: List[str]
    on_delete: Optional[str] = None

class IndexInfo(BaseModel):
    name: str
    columns: List[str]
    unique: bool
    dialect_options: Dict[str, Any] = {}

class TableSchemaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    table_name: str
    schema_name: str = "main"
    object_type: str = "TABLE"  # "TABLE" | "VIEW" | "SYSTEM_TABLE"
    is_system: bool = False
    view_definition: Optional[str] = None
    columns: List[ColumnInfo]
    primary_keys: List[str] = []
    foreign_keys: List[ForeignKeyInfo] = []
    indexes: List[IndexInfo] = []
    constraints: List[Dict[str, Any]] = []
    relationships: List[Dict[str, Any]] = []
    row_count: int
    count_is_estimated: bool = False
    size_bytes: int
    size_formatted: str

class TableSummary(BaseModel):
    name: str
    schema_name: str = "main"
    object_type: str = "TABLE"  # "TABLE" | "VIEW" | "SYSTEM_TABLE"
    is_system: bool = False
    rows: int
    count_is_estimated: bool = False
    size: str
    columns: List[str]
    primary_key: Optional[str] = None
    column_count: Optional[int] = None

class SchemaInfo(BaseModel):
    name: str
    status: str = "ONLINE"
    type: str = "USER"
    is_system: bool = False
    tables_count: int = 0
    views_count: int = 0
    system_tables_count: int = 0
    tables: List[str] = []
    views: List[str] = []
    system_tables: List[str] = []

class DbOverviewResponse(BaseModel):
    database_name: str
    dialect: str
    status: str
    latency_ms: float
    total_tables: int
    total_views: int = 0
    total_system_tables: int = 0
    total_records: int
    schemas: List[SchemaInfo] = []
    tables: List[TableSummary]
    views: List[TableSummary] = []
    foreign_keys_count: int
    recent_operations: List[Dict[str, Any]] = []
    relationships: List[Dict[str, Any]] = []

class PaginatedRecordsResponse(BaseModel):
    table: str
    schema_name: str = "main"
    object_type: str = "TABLE"
    columns: List[str]
    rows: List[Dict[str, Any]]
    total_count: int
    count_is_estimated: bool = False
    page: int
    page_size: int
    total_pages: int

class DbOperationRequest(BaseModel):
    operation: str  # "SELECT" | "INSERT" | "UPDATE" | "DELETE"
    table: str
    schema_name: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    filter_column: Optional[str] = None
    filter_value: Optional[Any] = None
    filter_operator: Optional[str] = "="
    limit: Optional[int] = 25
    order_by: Optional[str] = None
    order_dir: Optional[str] = "ASC"

class DbOperationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    success: bool
    operation: str
    table: str
    message: Optional[str] = None
    affected_rows: int = 0
    columns: List[str] = []
    rows: List[Dict[str, Any]] = []
    state_before: Optional[Any] = None
    state_after: Optional[Any] = None
    duration_ms: float = 0.0
    execution_id: Optional[str] = None
    trace_events: List[TraceEvent] = []
    error: Optional[str] = None
