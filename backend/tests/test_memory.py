import pytest
from app.schemas.memory import MemoryBlockInput, ProcessMemoryRequest
from app.os_engine.memory.first_fit import allocate_first_fit
from app.os_engine.memory.best_fit import allocate_best_fit
from app.os_engine.memory.worst_fit import allocate_worst_fit

@pytest.fixture
def sample_blocks():
    return [
        MemoryBlockInput(id="B1", size=100, status="FREE"),
        MemoryBlockInput(id="B2", size=500, status="FREE"),
        MemoryBlockInput(id="B3", size=200, status="FREE"),
        MemoryBlockInput(id="B4", size=300, status="FREE")
    ]

@pytest.fixture
def sample_processes():
    return [
        ProcessMemoryRequest(pid="P1", size=212),
        ProcessMemoryRequest(pid="P2", size=417),
        ProcessMemoryRequest(pid="P3", size=112),
        ProcessMemoryRequest(pid="P4", size=426)
    ]

def test_first_fit(sample_blocks, sample_processes):
    result = allocate_first_fit(sample_blocks, sample_processes)
    # P1 (212) -> B2 (500), splits B2 (288 FREE)
    # P2 (417) -> unallocated (no block has >= 417)
    # P3 (112) -> B2_split (288), splits to 176 FREE
    # P4 (426) -> unallocated
    assert len(result.allocations) == 2
    assert result.allocations[0].pid == "P1"
    assert result.allocations[0].block_id == "B2"
    assert result.allocations[1].pid == "P3"
    assert result.allocations[1].block_id.startswith("B2_split")
    assert "P2" in result.unallocated_processes
    assert "P4" in result.unallocated_processes

def test_best_fit(sample_blocks, sample_processes):
    result = allocate_best_fit(sample_blocks, sample_processes)
    # P1 (212) -> B4 (300), splits B4 (88 FREE)
    # P2 (417) -> B2 (500), splits B2 (83 FREE)
    # P3 (112) -> B3 (200), splits B3 (88 FREE)
    # P4 (426) -> unallocated
    assert len(result.allocations) == 3
    assert result.allocations[0].pid == "P1"
    assert result.allocations[0].block_id == "B4"
    assert result.allocations[1].pid == "P2"
    assert result.allocations[1].block_id == "B2"
    assert result.allocations[2].pid == "P3"
    assert result.allocations[2].block_id == "B3"
    assert "P4" in result.unallocated_processes

def test_worst_fit(sample_blocks, sample_processes):
    result = allocate_worst_fit(sample_blocks, sample_processes)
    # P1 (212) -> B2 (500) -> splits B2 (288 FREE)
    # P2 (417) -> unallocated (largest is B4 (300))
    # P3 (112) -> B4 (300) -> splits B4 (188 FREE)
    # P4 (426) -> unallocated
    assert len(result.allocations) == 2
    assert result.allocations[0].pid == "P1"
    assert result.allocations[0].block_id == "B2"
    assert result.allocations[1].pid == "P3"
    assert result.allocations[1].block_id == "B4"
    assert "P2" in result.unallocated_processes
    assert "P4" in result.unallocated_processes

def test_exact_match(sample_blocks):
    processes = [ProcessMemoryRequest(pid="PX", size=200)]
    result = allocate_best_fit(sample_blocks, processes)
    # Best fit should pick B3 exactly
    assert len(result.allocations) == 1
    assert result.allocations[0].block_id == "B3"
    # Check that B3 size remains 200 and status is ALLOCATED
    b3 = next(b for b in result.remaining_blocks if b.id == "B3")
    assert b3.size == 200
    assert b3.status == "ALLOCATED"
    # There should be 4 blocks (no new split block)
    assert len(result.remaining_blocks) == 4
