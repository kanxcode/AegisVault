import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_execution_history_and_detail():
    # 1. Run CPU scheduler to generate an execution
    res = client.post("/api/scheduling/run", json={
        "algorithm": "SJF",
        "processes": [
            {"pid": "P1", "arrival_time": 0, "burst_time": 10, "priority": 1},
            {"pid": "P2", "arrival_time": 0, "burst_time": 4, "priority": 1}
        ]
    })
    assert res.status_code == 200
    data = res.json()
    exec_id = data.get("execution_id")
    assert exec_id is not None
    assert len(data.get("trace_events", [])) > 0

    # 2. Query history
    hist = client.get("/api/executions/history?module=cpu_scheduler")
    assert hist.status_code == 200
    history_items = hist.json()
    assert any(h["execution_id"] == exec_id for h in history_items)

    # 3. Query execution detail
    detail = client.get(f"/api/executions/{exec_id}")
    assert detail.status_code == 200
    assert detail.json()["execution_id"] == exec_id

    # 4. Query execution trace
    trace = client.get(f"/api/executions/{exec_id}/trace")
    assert trace.status_code == 200
    assert len(trace.json()) > 0

    # 5. Query execution trace single step
    step1 = client.get(f"/api/executions/{exec_id}/trace/1")
    assert step1.status_code == 200
    assert step1.json()["step_number"] == 1

def test_compare_cpu():
    res = client.post("/api/executions/compare/cpu", json={
        "processes": [
            {"pid": "P1", "arrival_time": 0, "burst_time": 8, "priority": 2},
            {"pid": "P2", "arrival_time": 1, "burst_time": 4, "priority": 1},
            {"pid": "P3", "arrival_time": 2, "burst_time": 2, "priority": 3}
        ],
        "quantum": 3
    })
    assert res.status_code == 200
    data = res.json()
    assert "comparison_table" in data
    assert len(data["comparison_table"]) == 4
    assert "tradeoff_analysis" in data
    assert "SJF" in data["results"]
    assert "ROUND_ROBIN" in data["results"]

def test_compare_memory():
    res = client.post("/api/executions/compare/memory", json={
        "blocks": [
            {"id": "b1", "size": 100, "status": "FREE"},
            {"id": "b2", "size": 500, "status": "FREE"},
            {"id": "b3", "size": 200, "status": "FREE"},
            {"id": "b4", "size": 300, "status": "FREE"},
            {"id": "b5", "size": 600, "status": "FREE"}
        ],
        "processes": [
            {"pid": "p1", "size": 212},
            {"pid": "p2", "size": 417},
            {"pid": "p3", "size": 112},
            {"pid": "p4", "size": 426}
        ]
    })
    assert res.status_code == 200
    data = res.json()
    assert "comparison_table" in data
    assert len(data["comparison_table"]) == 3
    assert "tradeoff_analysis" in data

def test_compare_disk():
    res = client.post("/api/executions/compare/disk", json={
        "head": 50,
        "requests": [82, 170, 43, 140, 24, 16, 190],
        "disk_size": 200,
        "direction": "RIGHT"
    })
    assert res.status_code == 200
    data = res.json()
    assert "comparison_table" in data
    assert len(data["comparison_table"]) == 4
    assert "tradeoff_analysis" in data

def test_memory_trace():
    res = client.post("/api/memory/simulate", json={
        "algorithm": "BEST_FIT",
        "blocks": [
            {"id": "b1", "size": 100, "status": "FREE"},
            {"id": "b2", "size": 300, "status": "FREE"}
        ],
        "processes": [
            {"pid": "p1", "size": 150}
        ]
    })
    assert res.status_code == 200
    data = res.json()
    assert data["execution_id"] is not None
    assert len(data["trace_events"]) >= 2
    # Verify reasons and calculations
    alloc_ev = next(e for e in data["trace_events"] if e["operation"] == "block_allocation")
    assert "Best Fit" in alloc_ev["reason"]

def test_disk_trace():
    res = client.post("/api/disk/simulate", json={
        "algorithm": "SSTF",
        "head": 50,
        "requests": [10, 55, 90],
        "disk_size": 200,
        "direction": "RIGHT"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["execution_id"] is not None
    assert len(data["trace_events"]) >= 3
    # First serviced should be 55 because |50 - 55| = 5 < |50 - 10| = 40
    seek_55 = next(e for e in data["trace_events"] if e["entity"] == "TRACK_55")
    assert seek_55["calculation"]["seek_distance"] == 5

def test_paging_translation_trace():
    res = client.post("/api/paging/translate", json={
        "virtual_address": "0x1A4C",
        "page_size": 4096,
        "pid": "P101"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["execution_id"] is not None
    assert len(data["trace_events"]) >= 3
    decomp = next(e for e in data["trace_events"] if e["operation"] == "address_decomposition")
    assert decomp["calculation"]["page_number"] == 1
    assert decomp["calculation"]["offset"] == 2636

def test_sql_console_trace():
    res = client.post("/api/db/sql", json={
        "query": "SELECT * FROM users WHERE role = 'ADMIN'",
        "schema_name": "aegis_main"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["execution_id"] is not None
    assert len(data["trace_events"]) >= 3
    assert len(data["logical_plan"]) >= 4
