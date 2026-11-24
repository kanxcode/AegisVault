import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

def test_processes_api():
    res = client.get("/api/processes/")
    assert res.status_code == 200
    procs = res.json()
    assert len(procs) >= 5
    
    # State transition
    p101 = procs[0]
    pid = p101["pid"]
    patch_res = client.patch(f"/api/processes/{pid}/state", json={"state": "WAITING"})
    assert patch_res.status_code == 200
    assert patch_res.json()["state"] == "WAITING"
    
    # Revert back
    client.patch(f"/api/processes/{pid}/state", json={"state": "RUNNING"})

def test_files_api():
    tree_res = client.get("/api/files/tree")
    assert tree_res.status_code == 200
    tree = tree_res.json()
    assert len(tree) > 0

    # Content
    content_res = client.get("/api/files/content?path=/etc/aegis.conf")
    assert content_res.status_code == 200
    assert "covert_agent" in content_res.json()["content"]

def test_dbms_sql_api():
    # Safe SELECT
    sql_res = client.post("/api/db/sql", json={"query": "SELECT * FROM users WHERE role = 'ADMIN'"})
    assert sql_res.status_code == 200
    data = sql_res.json()
    assert data["success"] is True
    assert len(data["rows"]) >= 1

    # Blocked dangerous pattern
    bad_res = client.post("/api/db/sql", json={"query": "PRAGMA database_list;"})
    assert bad_res.status_code == 200
    assert bad_res.json()["success"] is False
    assert "Security Violation" in bad_res.json()["error"]

def test_transactions_api():
    # Begin transaction
    begin_res = client.post("/api/transactions/begin", json={"query": "UPDATE users SET role = 'OPERATOR' WHERE id = 1"})
    assert begin_res.status_code == 200
    tx = begin_res.json()
    assert tx["status"] == "ACTIVE"
    tx_id = tx["id"]

    # Locks
    locks_res = client.get("/api/transactions/locks")
    assert locks_res.status_code == 200
    assert any(l["tx_id"] == tx_id for l in locks_res.json())

    # Commit
    commit_res = client.post(f"/api/transactions/{tx_id}/commit")
    assert commit_res.status_code == 200
    assert commit_res.json()["status"] == "COMMITTED"

def test_paging_api():
    req = {
        "algorithm": "LRU",
        "frame_count": 3,
        "reference_string": [1, 2, 3, 2, 1, 4]
    }
    res = client.post("/api/paging/simulate", json=req)
    assert res.status_code == 200
    assert res.json()["algorithm"] == "LRU"

def test_system_metrics():
    res = client.get("/api/system/metrics")
    assert res.status_code == 200
    data = res.json()
    assert "cpu_utilization" in data
    assert "memory_utilization" in data
    assert "uptime_seconds" in data
    assert isinstance(data["uptime_seconds"], (int, float))
    assert data["uptime_seconds"] >= 0
    assert len(data["telemetry"]) > 0
