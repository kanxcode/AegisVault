import pytest
from app.os_engine.paging.fifo import simulate_fifo
from app.os_engine.paging.lru import simulate_lru
from app.os_engine.paging.optimal import simulate_optimal
from app.os_engine.paging.translator import translate_address

def test_fifo_paging():
    refs = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1]
    res = simulate_fifo(refs, 3)
    assert res["page_faults"] == 15
    assert res["hits"] == 5
    assert res["total_references"] == 20
    assert len(res["steps"]) == 20

def test_lru_paging():
    refs = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1]
    res = simulate_lru(refs, 3)
    assert res["page_faults"] == 12
    assert res["hits"] == 8
    assert res["fault_rate"] == 60.0

def test_optimal_paging():
    refs = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1]
    res = simulate_optimal(refs, 3)
    assert res["page_faults"] == 9
    assert res["hits"] == 11
    assert res["fault_rate"] == 45.0

def test_address_translation_tlb_hit():
    res = translate_address("0x000A", page_size=4096)
    # Page number 0 is in TLB
    assert res["page_number"] == 0
    assert res["tlb_hit"] is True
    assert res["physical_address"] == "0x000A"
    assert res["latency_ns"] == 2

def test_address_translation_page_table():
    res = translate_address("0x2005", page_size=4096)
    # Page number 0x2005 // 4096 = 2
    assert res["page_number"] == 2
    assert res["frame_number"] == 4
    assert res["offset"] == 5
    assert res["physical_address"] == "0x4005"
