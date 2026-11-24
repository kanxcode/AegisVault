import pytest
from app.os_engine.disk.fcfs import schedule_fcfs
from app.os_engine.disk.sstf import schedule_sstf
from app.os_engine.disk.scan import schedule_scan
from app.os_engine.disk.cscan import schedule_cscan

@pytest.fixture
def sample_requests():
    return [98, 183, 37, 122, 14, 65, 67]

@pytest.fixture
def initial_head():
    return 53

@pytest.fixture
def disk_size():
    return 200

def test_disk_fcfs(initial_head, sample_requests):
    result = schedule_fcfs(initial_head, sample_requests)
    assert result.algorithm == "FCFS"
    assert result.movement_path == [53, 98, 183, 37, 122, 14, 65, 67]
    assert result.total_head_movement == 522

def test_disk_sstf(initial_head, sample_requests):
    result = schedule_sstf(initial_head, sample_requests)
    assert result.algorithm == "SSTF"
    assert result.movement_path == [53, 65, 67, 37, 14, 98, 122, 183]
    assert result.total_head_movement == 236

def test_disk_scan_right(initial_head, sample_requests, disk_size):
    result = schedule_scan(initial_head, sample_requests, disk_size, "RIGHT")
    assert result.algorithm == "SCAN"
    # 53 -> 65 -> 67 -> 98 -> 122 -> 183 -> 199 -> 37 -> 14
    assert result.movement_path == [53, 65, 67, 98, 122, 183, 199, 37, 14]
    assert result.total_head_movement == (199 - 53) + (199 - 14) # 146 + 185 = 331

def test_disk_cscan_right(initial_head, sample_requests, disk_size):
    result = schedule_cscan(initial_head, sample_requests, disk_size, "RIGHT")
    assert result.algorithm == "C-SCAN"
    # 53 -> 65 -> 67 -> 98 -> 122 -> 183 -> 199 -> 0 -> 14 -> 37
    assert result.movement_path == [53, 65, 67, 98, 122, 183, 199, 0, 14, 37]
    assert result.total_head_movement == (199 - 53) + (199 - 0) + (37 - 0) # 146 + 199 + 37 = 382

def test_disk_scan_left(initial_head, sample_requests, disk_size):
    result = schedule_scan(initial_head, sample_requests, disk_size, "LEFT")
    assert result.algorithm == "SCAN"
    # 53 -> 37 -> 14 -> 0 -> 65 -> 67 -> 98 -> 122 -> 183
    assert result.movement_path == [53, 37, 14, 0, 65, 67, 98, 122, 183]
    assert result.total_head_movement == (53 - 0) + (183 - 0)

def test_disk_cscan_left(initial_head, sample_requests, disk_size):
    result = schedule_cscan(initial_head, sample_requests, disk_size, "LEFT")
    assert result.algorithm == "C-SCAN"
    # 53 -> 37 -> 14 -> 0 -> 199 -> 183 -> 122 -> 98 -> 67 -> 65
    assert result.movement_path == [53, 37, 14, 0, 199, 183, 122, 98, 67, 65]
    assert result.total_head_movement == (53 - 0) + (199 - 0) + (199 - 65)

def test_disk_zero_seek_single_track_at_head():
    result = schedule_sstf(50, [50])
    assert result.service_order == [50]
    assert result.movement_path == [50, 50]
    assert result.total_head_movement == 0
