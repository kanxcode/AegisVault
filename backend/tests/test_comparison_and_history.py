from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_cpu_comparison():
    payload = {
        "processes": [
            {"pid": "P1", "arrival_time": 0, "burst_time": 10, "priority": 2},
            {"pid": "P2", "arrival_time": 1, "burst_time": 4, "priority": 1},
            {"pid": "P3", "arrival_time": 2, "burst_time": 6, "priority": 3}
        ],
        "quantum": 3
    }
    res = client.post("/api/executions/compare/cpu", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["module"] == "CPU_SCHEDULING"
    assert "comparison_table" in data
    assert len(data["comparison_table"]) == 4
    algos = [row["algorithm"] for row in data["comparison_table"]]
    assert "FCFS" in algos
    assert "SJF" in algos
    assert "ROUND_ROBIN" in algos
    assert "PRIORITY" in algos
    assert "tradeoff_analysis" in data
    assert "best_waiting_algorithm" in data

def test_memory_comparison():
    payload = {
        "blocks": [
            {"id": "B1", "size": 100, "status": "FREE"},
            {"id": "B2", "size": 500, "status": "FREE"},
            {"id": "B3", "size": 200, "status": "FREE"}
        ],
        "processes": [
            {"pid": "P1", "size": 90},
            {"pid": "P2", "size": 150}
        ]
    }
    res = client.post("/api/executions/compare/memory", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["module"] == "MEMORY_ALLOCATION"
    assert "comparison_table" in data
    assert len(data["comparison_table"]) == 3
    algos = [row["algorithm"] for row in data["comparison_table"]]
    assert "FIRST_FIT" in algos
    assert "BEST_FIT" in algos
    assert "WORST_FIT" in algos
    assert "tradeoff_analysis" in data

def test_disk_comparison():
    payload = {
        "head": 50,
        "requests": [10, 80, 25, 95, 120],
        "disk_size": 200,
        "direction": "RIGHT"
    }
    res = client.post("/api/executions/compare/disk", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["module"] == "DISK_SCHEDULING"
    assert "comparison_table" in data
    assert len(data["comparison_table"]) == 4
    algos = [row["algorithm"] for row in data["comparison_table"]]
    assert "FCFS" in algos
    assert "SSTF" in algos
    assert "SCAN" in algos
    assert "C-SCAN" in algos
    assert "best_movement_algorithm" in data
    assert "tradeoff_analysis" in data

def test_execution_history_and_trace_retrieval():
    # Run a CPU simulation first to generate an execution
    sched_payload = {
        "algorithm": "FCFS",
        "processes": [
            {"pid": "T1", "arrival_time": 0, "burst_time": 5, "priority": 1}
        ]
    }
    sched_res = client.post("/api/scheduling/run", json=sched_payload)
    assert sched_res.status_code == 200
    exec_id = sched_res.json()["execution_id"]
    assert exec_id is not None

    # Retrieve history
    hist_res = client.get("/api/executions/history?limit=50")
    assert hist_res.status_code == 200
    history = hist_res.json()
    assert isinstance(history, list)
    assert any(h["execution_id"] == exec_id for h in history)

    # Retrieve single execution detail
    detail_res = client.get(f"/api/executions/{exec_id}")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["execution_id"] == exec_id
    assert len(detail["trace_events"]) > 0

    # Retrieve paginated trace
    trace_res = client.get(f"/api/executions/{exec_id}/trace?offset=0&limit=5")
    assert trace_res.status_code == 200
    trace_events = trace_res.json()
    assert len(trace_events) > 0

    # Retrieve single step
    step_res = client.get(f"/api/executions/{exec_id}/trace/1")
    assert step_res.status_code == 200
    step = step_res.json()
    assert step["step_number"] == 1
    assert step["execution_id"] == exec_id

def test_rename_file_api():
    import uuid
    suffix = uuid.uuid4().hex[:8]
    orig_name = f"rename_test_{suffix}.txt"
    new_name = f"renamed_{suffix}.txt"
    
    # Create file first
    create_payload = {
        "name": orig_name,
        "parent_path": "/var/log",
        "is_directory": False,
        "content": "Original Content"
    }
    c_res = client.post("/api/files/", json=create_payload)
    assert c_res.status_code == 200

    # Rename it
    rename_payload = {
        "path": f"/var/log/{orig_name}",
        "new_name": new_name
    }
    r_res = client.post("/api/files/rename", json=rename_payload)
    assert r_res.status_code == 200
    r_data = r_res.json()
    assert r_data["name"] == new_name
    assert r_data["path"] == f"/var/log/{new_name}"
    assert "trace_events" in r_data
    assert len(r_data["trace_events"]) > 0
    assert r_data["trace_events"][0]["operation"] == "file_rename"

    # Cleanup
    client.delete(f"/api/files/?path=/var/log/{new_name}")

def test_comparison_payload_validation():
    bad_cpu = client.post("/api/executions/compare/cpu", json={
        "processes": [{"pid": "P1", "arrival_time": 0, "burst_time": 0, "priority": 1}],
        "quantum": 2,
    })
    assert bad_cpu.status_code == 400

    bad_quantum = client.post("/api/executions/compare/cpu", json={
        "processes": [{"pid": "P1", "arrival_time": 0, "burst_time": 5, "priority": 1}],
        "quantum": 0,
    })
    assert bad_quantum.status_code == 400

    bad_mem = client.post("/api/executions/compare/memory", json={
        "blocks": [{"id": "B1", "size": -10, "status": "FREE"}],
        "processes": [{"pid": "P1", "size": 50}],
    })
    assert bad_mem.status_code == 400

    bad_disk = client.post("/api/executions/compare/disk", json={
        "head": 250,
        "requests": [10, 20],
        "disk_size": 200,
        "direction": "RIGHT",
    })
    assert bad_disk.status_code == 400

    bad_dir = client.post("/api/executions/compare/disk", json={
        "head": 50,
        "requests": [10, 20],
        "disk_size": 200,
        "direction": "UP",
    })
    assert bad_dir.status_code == 400
