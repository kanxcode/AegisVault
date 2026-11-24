from typing import Dict, Any, List, Optional
from app.os_engine.trace_engine import TraceCollector

def translate_address(
    virtual_address_hex: str, 
    page_size: int = 4096, 
    tlb_entries: List[Dict[str, Any]] = None,
    page_table: List[Dict[str, Any]] = None,
    collector: Optional[TraceCollector] = None
) -> Dict[str, Any]:
    """
    Translates virtual address to physical address with TLB, Page Table lookup, and explainable trace events.
    """
    if collector is None:
        collector = TraceCollector(module="paging")

    # Parse hex string (e.g., '0x1A4C' or '1A4C')
    clean_hex = virtual_address_hex.strip()
    if clean_hex.lower().startswith("0x"):
        clean_hex = clean_hex[2:]
        
    try:
        virtual_addr = int(clean_hex, 16)
    except ValueError:
        virtual_addr = 0
        clean_hex = "0000"

    page_number = virtual_addr // page_size
    offset = virtual_addr % page_size

    # Step 1: Address Decomposition Trace
    collector.emit(
        simulation_time=1.0,
        operation="address_decomposition",
        entity=f"0x{clean_hex.upper()}",
        action="decompose",
        reason=f"Decomposed logical address 0x{clean_hex.upper()} ({virtual_addr}) using page size {page_size} bytes.",
        explanation=(
            f"Page Number = Logical Address // Page Size = {virtual_addr} // {page_size} = {page_number} (0x{page_number:02X}). "
            f"Offset = Logical Address % Page Size = {virtual_addr} % {page_size} = {offset} (0x{offset:03X})."
        ),
        calculation={
            "virtual_address": f"0x{clean_hex.upper()}",
            "virtual_decimal": virtual_addr,
            "page_size": page_size,
            "page_number": page_number,
            "offset": offset
        },
        state_before={"status": "UNTRANSLATED", "virtual_address": f"0x{clean_hex.upper()}"},
        state_after={"page_number": page_number, "offset": offset},
        affected_entities=[f"PAGE_{page_number}"],
        next_step=f"Check Translation Lookaside Buffer (TLB) for Page {page_number}"
    )

    if tlb_entries is None:
        tlb_entries = [
            {"tag": "01", "page": 0, "frame": 0},
            {"tag": "02", "page": 2, "frame": 4},
            {"tag": "03", "page": 4, "frame": 8},
        ]

    # Step 2: Check TLB
    tlb_hit = False
    frame_number = None
    tlb_entry_matched = None

    for entry in tlb_entries:
        if entry.get("page") == page_number:
            tlb_hit = True
            frame_number = entry.get("frame")
            tlb_entry_matched = entry
            break

    if tlb_hit:
        collector.emit(
            simulation_time=2.0,
            operation="tlb_lookup",
            entity=f"TLB_TAG_{tlb_entry_matched.get('tag')}",
            action="tlb_hit",
            reason=f"TLB Hit: Page {page_number} found in fast hardware TLB cache pointing to Frame {frame_number}.",
            explanation="The MMU located the mapping in the high-speed associative TLB cache. Memory access completes in ~2ns without consulting memory page tables.",
            calculation={"page": page_number, "frame": frame_number, "tlb_tag": tlb_entry_matched.get("tag"), "latency_ns": 2},
            state_before={"tlb_status": "SEARCHING"},
            state_after={"tlb_status": "HIT", "frame_number": frame_number},
            affected_entities=[f"FRAME_{frame_number}"],
            next_step="Calculate physical address"
        )
    else:
        collector.emit(
            simulation_time=2.0,
            operation="tlb_lookup",
            entity="TLB",
            action="tlb_miss",
            reason=f"TLB Miss: Page {page_number} is not cached in TLB. Must consult process page table in RAM.",
            explanation="Page number not found in TLB entries. Access latency increases as system must fetch page table entry from main memory (~100ns).",
            calculation={"page": page_number, "tlb_entries_checked": len(tlb_entries), "latency_ns": 100},
            state_before={"tlb_status": "SEARCHING"},
            state_after={"tlb_status": "MISS"},
            affected_entities=[f"PAGE_{page_number}"],
            next_step="Query Process Page Table in main memory"
        )

    # Step 3: Page Table Lookup if TLB Miss
    page_fault = False
    if page_table is None:
        page_table = [
            {"page": 0, "frame": 0, "valid": True, "modified": False},
            {"page": 1, "frame": None, "valid": False, "modified": False},
            {"page": 2, "frame": 4, "valid": True, "modified": True},
            {"page": 3, "frame": None, "valid": False, "modified": False},
            {"page": 4, "frame": 8, "valid": True, "modified": False},
            {"page": 5, "frame": 10, "valid": True, "modified": False},
            {"page": 6, "frame": 12, "valid": True, "modified": True},
            {"page": 7, "frame": None, "valid": False, "modified": False},
        ]

    if not tlb_hit:
        matching_pt = next((pt for pt in page_table if pt.get("page") == page_number), None)
        if matching_pt and matching_pt.get("valid") and matching_pt.get("frame") is not None:
            frame_number = matching_pt.get("frame")
            collector.emit(
                simulation_time=3.0,
                operation="page_table_lookup",
                entity=f"PT_ENTRY_{page_number}",
                action="page_table_hit",
                reason=f"Page Table Hit: Entry for Page {page_number} has valid bit=1 and maps to Frame {frame_number}.",
                explanation="The page table confirms the requested page is resident in physical memory frame. Valid bit is set.",
                calculation={"page": page_number, "valid": True, "frame": frame_number, "modified": matching_pt.get("modified", False)},
                state_before={"page_table_status": "SEARCHING"},
                state_after={"page_table_status": "VALID", "frame_number": frame_number},
                affected_entities=[f"FRAME_{frame_number}"],
                next_step="Calculate physical address"
            )
        else:
            page_fault = True
            frame_number = (page_number * 2) % 32
            collector.emit(
                simulation_time=3.0,
                operation="page_fault_trap",
                entity=f"PAGE_{page_number}",
                action="page_fault",
                reason=f"Page Fault: Page {page_number} is not resident in physical RAM (valid bit = 0).",
                explanation=(
                    f"Page fault interrupt generated. OS traps to kernel page fault handler, reads page {page_number} "
                    f"from backing store (swap disk), allocates physical Frame {frame_number}, and updates page table valid bit to 1."
                ),
                calculation={"page": page_number, "valid_bit": False, "allocated_frame": frame_number, "trap_latency_ns": 8000},
                state_before={"valid": False, "frame": None},
                state_after={"valid": True, "frame": frame_number},
                affected_entities=[f"PAGE_{page_number}", f"FRAME_{frame_number}"],
                status="FAULT",
                next_step="Page-in complete. Compute physical address."
            )

    # Step 4: Physical Address Synthesis
    physical_addr = (frame_number * page_size) + offset
    physical_addr_hex = f"0x{physical_addr:04X}"
    page_hex = f"0x{page_number:02X}"
    frame_hex = f"0x{frame_number:02X}"
    offset_hex = f"0x{offset:03X}"
    latency_ns = 2 if tlb_hit else (100 if not page_fault else 8000)

    collector.emit(
        simulation_time=4.0,
        operation="physical_address_synthesis",
        entity=physical_addr_hex,
        action="synthesis",
        reason=f"Synthesized Physical Address {physical_addr_hex} ({physical_addr}) from Frame {frame_number} and Offset {offset}.",
        explanation=(
            f"Physical Address = (Frame Number * Page Size) + Offset = ({frame_number} * {page_size}) + {offset} "
            f"= {frame_number * page_size} + {offset} = {physical_addr} ({physical_addr_hex}). Total latency: {latency_ns} ns."
        ),
        calculation={
            "frame_number": frame_number,
            "frame_hex": frame_hex,
            "page_size": page_size,
            "offset": offset,
            "offset_hex": offset_hex,
            "physical_address_decimal": physical_addr,
            "physical_address_hex": physical_addr_hex,
            "latency_ns": latency_ns
        },
        state_before={"frame": frame_number, "offset": offset},
        state_after={"physical_address": physical_addr_hex, "latency_ns": latency_ns},
        affected_entities=[f"FRAME_{frame_number}", physical_addr_hex],
        next_step="Memory operand accessed successfully"
    )

    return {
        "virtual_address": f"0x{clean_hex.upper()}",
        "virtual_decimal": virtual_addr,
        "page_size": page_size,
        "page_number": page_number,
        "page_hex": page_hex,
        "offset": offset,
        "offset_hex": offset_hex,
        "tlb_hit": tlb_hit,
        "page_fault": page_fault,
        "frame_number": frame_number,
        "frame_hex": frame_hex,
        "physical_address": physical_addr_hex,
        "physical_decimal": physical_addr,
        "latency_ns": latency_ns,
        "lookup_trace": "TLB HIT -> Physical Address" if tlb_hit else ("Page Table HIT -> Physical Address" if not page_fault else "Page Fault -> OS Trap -> Page In -> Physical Address"),
        "execution_id": collector.execution_id,
        "trace_events": collector.get_events()
    }
