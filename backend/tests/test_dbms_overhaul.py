import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_db_overview():
    res = client.get("/api/db/overview")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ONLINE"
    assert data["total_tables"] >= 10
    assert data["total_records"] >= 1
    assert len(data["tables"]) >= 10
    assert "dialect" in data

def test_db_relationships():
    res = client.get("/api/db/relationships")
    assert res.status_code == 200
    rels = res.json()
    assert len(rels) >= 1
    # Check sessions -> users relationship
    session_user_rel = next((r for r in rels if r["source_table"] == "sessions" and r["target_table"] == "users"), None)
    assert session_user_rel is not None
    assert session_user_rel["source_column"] == "user_id"
    assert session_user_rel["target_column"] == "id"

def test_db_paginated_records():
    res = client.get("/api/db/tables/users/records?page=1&page_size=5&sort_by=id&sort_order=asc")
    assert res.status_code == 200
    data = res.json()
    assert data["table"] == "users"
    assert len(data["rows"]) <= 5
    assert data["total_count"] >= 1
    assert "username" in data["columns"]

def test_db_operations_crud_and_trace():
    # 1. SELECT via operations
    sel_res = client.post("/api/db/operations/execute", json={
        "operation": "SELECT",
        "table": "users",
        "filter_column": "role",
        "filter_value": "ADMIN",
        "limit": 10
    })
    assert sel_res.status_code == 200
    sel_data = sel_res.json()
    assert sel_data["success"] is True
    assert len(sel_data["rows"]) >= 1
    assert len(sel_data["trace_events"]) >= 5

    # 2. INSERT a test record into system_config (ensure clean slate first)
    test_key = "test_config_entry_1"
    client.post("/api/db/operations/execute", json={
        "operation": "DELETE",
        "table": "system_config",
        "filter_column": "key",
        "filter_value": test_key
    })
    ins_res = client.post("/api/db/operations/execute", json={
        "operation": "INSERT",
        "table": "system_config",
        "data": {
            "key": test_key,
            "value": "initial_value",
            "updated_by": "test_agent"
        }
    })
    assert ins_res.status_code == 200
    ins_data = ins_res.json()
    assert ins_data["success"] is True
    assert ins_data["affected_rows"] == 1
    assert len(ins_data["trace_events"]) >= 6

    # 3. UPDATE the record
    upd_res = client.post("/api/db/operations/execute", json={
        "operation": "UPDATE",
        "table": "system_config",
        "filter_column": "key",
        "filter_value": test_key,
        "data": {
            "value": "updated_value"
        }
    })
    assert upd_res.status_code == 200
    upd_data = upd_res.json()
    assert upd_data["success"] is True
    assert upd_data["affected_rows"] == 1
    assert upd_data["state_before"]["value"] == "initial_value"
    assert upd_data["state_after"]["value"] == "updated_value"
    assert len(upd_data["trace_events"]) >= 7

    # 4. DELETE the test record
    del_res = client.post("/api/db/operations/execute", json={
        "operation": "DELETE",
        "table": "system_config",
        "filter_column": "key",
        "filter_value": test_key
    })
    assert del_res.status_code == 200
    del_data = del_res.json()
    assert del_data["success"] is True
    assert del_data["affected_rows"] == 1
    assert del_data["state_before"]["key"] == test_key
    assert len(del_data["trace_events"]) >= 7

def test_db_operations_constraint_failure():
    # Attempting to insert an invalid foreign key in sessions
    bad_res = client.post("/api/db/operations/execute", json={
        "operation": "INSERT",
        "table": "sessions",
        "data": {
            "id": "sess_bad_fk",
            "user_id": 999999,  # Non-existent user
            "token": "tok_123"
        }
    })
    assert bad_res.status_code == 200
    bad_data = bad_res.json()
    assert bad_data["success"] is False
    assert "Foreign key constraint violation" in bad_data["error"]
    assert any(ev["status"] == "REJECTED" for ev in bad_data["trace_events"])


def test_db_observatory_views_and_system_discovery():
    # Discover views and schemas dynamically
    ov_res = client.get("/api/db/overview?include_system=true")
    assert ov_res.status_code == 200
    ov = ov_res.json()
    assert ov["total_views"] >= 2
    assert len(ov["schemas"]) >= 1
    view_names = [v["name"] for v in ov["views"]]
    assert "v_active_sessions" in view_names
    assert "v_active_processes" in view_names

    # Inspect view schema and records
    v_schema = client.get("/api/db/tables/v_active_sessions/schema")
    assert v_schema.status_code == 200
    assert v_schema.json()["object_type"] == "VIEW"
    assert v_schema.json()["view_definition"] is not None

    v_records = client.get("/api/db/tables/v_active_sessions/records?page=1&page_size=10")
    assert v_records.status_code == 200
    assert v_records.json()["object_type"] == "VIEW"
    assert "username" in v_records.json()["columns"]

    # Mutating a view via operations must be safely rejected
    mut_res = client.post("/api/db/operations/execute", json={
        "operation": "DELETE",
        "table": "v_active_sessions",
        "filter_column": "username",
        "filter_value": "neo"
    })
    assert mut_res.status_code == 200
    assert mut_res.json()["success"] is False
    assert "read-only" in mut_res.json()["error"]


def test_db_observatory_dynamic_table_and_invalid_identifier():
    # Create a brand new table dynamically and verify immediate discovery on refresh
    create_res = client.post("/api/db/sql", json={
        "query": "CREATE TABLE IF NOT EXISTS observatory_dynamic_test (id INTEGER PRIMARY KEY, label TEXT NOT NULL);"
    })
    assert create_res.status_code == 200
    assert create_res.json()["success"] is True

    tables_res = client.get("/api/db/tables?schema_name=ALL")
    assert tables_res.status_code == 200
    names = [t["name"] for t in tables_res.json()]
    assert "observatory_dynamic_test" in names

    # Cleanup dynamic test table
    drop_res = client.post("/api/db/sql", json={"query": "DROP TABLE IF EXISTS observatory_dynamic_test;"})
    assert drop_res.status_code == 200

    # Invalid identifier rejection
    bad_ident = client.get("/api/db/tables/users;DROP/schema")
    assert bad_ident.status_code == 400

    missing_tbl = client.get("/api/db/tables/nonexistent_table_xyz/records")
    assert missing_tbl.status_code == 404


