from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import re

from app.database.connection import get_db
from app.models.simulation import VirtualFileModel, SystemEvent, ExecutionModel
from app.schemas.files import (
    VirtualFileCreate, VirtualFileUpdateContent, VirtualFileRename,
    VirtualFileResponse, StorageInfoResponse
)
from app.os_engine.trace_engine import TraceCollector

router = APIRouter()

def build_tree_node(file_obj: VirtualFileModel, all_files: List[VirtualFileModel]):
    node = {
        "id": file_obj.id,
        "name": file_obj.name,
        "path": file_obj.path,
        "type": "DIRECTORY" if file_obj.is_directory else "FILE",
        "size": file_obj.size,
        "permissions": file_obj.permissions,
        "modified": file_obj.modified_at,
        "children": []
    }
    if file_obj.is_directory:
        children = [f for f in all_files if f.parent_path == file_obj.path]
        node["children"] = [build_tree_node(c, all_files) for c in children]
    return node

@router.get("/tree")
def get_file_tree(db: Session = Depends(get_db)):
    all_files = db.query(VirtualFileModel).all()
    root_nodes = [f for f in all_files if f.parent_path == "/"]
    
    tree = [
        {
            "id": "root_dir",
            "name": "root",
            "path": "/",
            "type": "DIRECTORY",
            "size": sum(f.size for f in all_files),
            "permissions": "rwxr-xr-x",
            "modified": "2026-09-24 10:00",
            "children": [build_tree_node(r, all_files) for r in root_nodes]
        }
    ]
    return tree

@router.get("/directory")
def get_directory_contents(path: str = Query("/var/log", description="Directory path"), db: Session = Depends(get_db)):
    files = db.query(VirtualFileModel).filter(VirtualFileModel.parent_path == path).all()
    return [
        {
            "id": f.id,
            "name": f.name,
            "path": f.path,
            "type": "DIRECTORY" if f.is_directory else "FILE",
            "size": f.size,
            "permissions": f.permissions,
            "modified": f.modified_at,
            "content": f.content
        }
        for f in files
    ]

@router.get("/content")
def get_file_content(path: str = Query(..., description="File path"), db: Session = Depends(get_db)):
    file_record = db.query(VirtualFileModel).filter(VirtualFileModel.path == path).first()
    if not file_record:
        raise HTTPException(status_code=404, detail=f"File {path} not found")
    if file_record.is_directory:
        raise HTTPException(status_code=400, detail="Path is a directory, not a file")
        
    return {
        "path": file_record.path,
        "name": file_record.name,
        "size": file_record.size,
        "permissions": file_record.permissions,
        "modified": file_record.modified_at,
        "content": file_record.content or ""
    }

@router.post("/", response_model=VirtualFileResponse)
def create_virtual_file(file_in: VirtualFileCreate, db: Session = Depends(get_db)):
    collector = TraceCollector(module="virtual_fs")
    
    # 1. Path validation
    clean_name = file_in.name.strip()
    if not clean_name or "/" in clean_name:
        raise HTTPException(status_code=400, detail="Invalid file name: cannot be empty or contain '/'")
        
    parent = file_in.parent_path.rstrip("/")
    if not parent:
        parent = "/"
        
    full_path = f"{parent}/{clean_name}" if parent != "/" else f"/{clean_name}"

    collector.emit(
        simulation_time=1.0,
        operation="path_validation",
        entity=full_path,
        action="validate_path",
        reason=f"Validating path syntax and hierarchy for requested path: '{full_path}'.",
        explanation="The simulated VFS validates that the path begins at root '/' and contains legitimate alphanumeric characters.",
        calculation={"parent_path": parent, "target_name": clean_name, "constructed_path": full_path},
        state_before={"target_path": full_path},
        state_after={"validated": True},
        affected_entities=[full_path],
        next_step="Verify parent directory existence"
    )

    # 2. Parent directory verification
    if parent != "/":
        parent_dir = db.query(VirtualFileModel).filter(VirtualFileModel.path == parent).first()
        if not parent_dir:
            collector.emit(
                simulation_time=2.0,
                operation="parent_lookup",
                entity=parent,
                action="lookup_failed",
                reason=f"Parent directory '{parent}' does not exist.",
                explanation="Files cannot be created in non-existent directory paths. Aborting operation.",
                calculation={"parent": parent, "exists": False},
                state_before={"parent_exists": False},
                state_after={"error": "ENOENT"},
                affected_entities=[parent],
                status="REJECTED",
                next_step="Abort file creation"
            )
            raise HTTPException(status_code=400, detail=f"Parent directory '{parent}' does not exist")
        if not parent_dir.is_directory:
            raise HTTPException(status_code=400, detail=f"Parent path '{parent}' is a file, not a directory")

    collector.emit(
        simulation_time=2.0,
        operation="parent_verification",
        entity=parent,
        action="verified",
        reason=f"Parent directory '{parent}' verified as valid directory container.",
        explanation="Target parent inode verified. Write permissions confirmed for directory entry insertion.",
        calculation={"parent_path": parent, "is_directory": True},
        state_before={"parent_path": parent},
        state_after={"parent_status": "CONFIRMED"},
        affected_entities=[parent],
        next_step="Check target path uniqueness"
    )

    # 3. Target uniqueness check
    existing = db.query(VirtualFileModel).filter(VirtualFileModel.path == full_path).first()
    if existing:
        collector.emit(
            simulation_time=3.0,
            operation="uniqueness_check",
            entity=full_path,
            action="collision_detected",
            reason=f"Target node '{full_path}' already exists in virtual filesystem.",
            explanation="File or directory collisions are forbidden. OS returns EEXIST.",
            calculation={"path": full_path, "existing_inode": existing.id},
            state_before={"exists": True},
            state_after={"error": "EEXIST"},
            affected_entities=[full_path],
            status="REJECTED",
            next_step="Abort"
        )
        raise HTTPException(status_code=400, detail=f"File or directory '{full_path}' already exists")

    content_bytes = len((file_in.content or "").encode("utf-8")) if not file_in.is_directory else 4096
    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    inode_id = f"vf_{int(datetime.utcnow().timestamp() * 1000)}"
    
    new_file = VirtualFileModel(
        id=inode_id,
        name=clean_name,
        path=full_path,
        parent_path=parent,
        is_directory=file_in.is_directory,
        size=content_bytes,
        permissions=file_in.permissions,
        content=file_in.content if not file_in.is_directory else None,
        modified_at=now_str
    )
    db.add(new_file)

    collector.emit(
        simulation_time=4.0,
        operation="inode_allocation",
        entity=inode_id,
        action="allocated",
        reason=f"Allocated virtual inode {inode_id} for {'directory' if file_in.is_directory else 'file'} '{full_path}' ({content_bytes} bytes).",
        explanation=f"Allocated inode metadata block with permissions '{file_in.permissions}' and size {content_bytes} bytes. Directory entry linked.",
        calculation={"inode": inode_id, "size_bytes": content_bytes, "permissions": file_in.permissions, "is_dir": file_in.is_directory},
        state_before={"inode_allocated": False},
        state_after={"inode": inode_id, "path": full_path, "size": content_bytes},
        affected_entities=[inode_id, full_path],
        next_step="Directory entry linked and synced"
    )

    execution_record = ExecutionModel(
        id=collector.execution_id,
        module="virtual_fs",
        algorithm="CREATE_NODE",
        status="COMPLETED",
        input_data=file_in.model_dump(),
        result_data={"id": inode_id, "path": full_path, "size": content_bytes},
        summary_metrics={"size_bytes": content_bytes, "is_directory": file_in.is_directory},
        trace_events=collector.get_events_dict(),
        total_steps=len(collector.get_events())
    )
    db.add(execution_record)

    event = SystemEvent(
        module="FS",
        event="FILE_CREATED",
        severity="INFO",
        description=f"Created {'directory' if file_in.is_directory else 'file'} {full_path} ({content_bytes} bytes) [Exec ID: {collector.execution_id}]."
    )
    db.add(event)
    db.commit()
    db.refresh(new_file)

    resp = VirtualFileResponse.model_validate(new_file)
    resp.execution_id = collector.execution_id
    resp.trace_events = collector.get_events()
    return resp

@router.put("/content", response_model=VirtualFileResponse)
def update_file_content(payload: VirtualFileUpdateContent, db: Session = Depends(get_db)):
    collector = TraceCollector(module="virtual_fs")
    
    file_record = db.query(VirtualFileModel).filter(VirtualFileModel.path == payload.path).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    if file_record.is_directory:
        raise HTTPException(status_code=400, detail="Cannot write content to a directory")

    old_size = file_record.size
    new_bytes = len(payload.content.encode("utf-8"))
    
    collector.emit(
        simulation_time=1.0,
        operation="file_write",
        entity=file_record.path,
        action="update_content",
        reason=f"Writing {new_bytes} bytes to '{file_record.path}' (previous size: {old_size} bytes).",
        explanation="Buffer flushed to virtual file payload. File size and modified timestamp updated in inode.",
        calculation={"old_size_bytes": old_size, "new_size_bytes": new_bytes, "delta": new_bytes - old_size},
        state_before={"size": old_size, "content_preview": (file_record.content or "")[:30]},
        state_after={"size": new_bytes, "content_preview": payload.content[:30]},
        affected_entities=[file_record.path],
        next_step="Commit file changes"
    )

    file_record.content = payload.content
    file_record.size = new_bytes
    file_record.modified_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M")

    execution_record = ExecutionModel(
        id=collector.execution_id,
        module="virtual_fs",
        algorithm="WRITE_FILE",
        status="COMPLETED",
        input_data={"path": payload.path, "bytes": new_bytes},
        result_data={"path": payload.path, "new_size": new_bytes},
        summary_metrics={"delta_bytes": new_bytes - old_size},
        trace_events=collector.get_events_dict(),
        total_steps=1
    )
    db.add(execution_record)

    event = SystemEvent(
        module="FS",
        event="FILE_MODIFIED",
        severity="INFO",
        description=f"Modified file {file_record.path} (new size: {file_record.size} bytes) [Exec ID: {collector.execution_id}]."
    )
    db.add(event)
    db.commit()
    db.refresh(file_record)

    resp = VirtualFileResponse.model_validate(file_record)
    resp.execution_id = collector.execution_id
    resp.trace_events = collector.get_events()
    return resp

@router.post("/rename", response_model=VirtualFileResponse)
def rename_virtual_file(payload: VirtualFileRename, db: Session = Depends(get_db)):
    collector = TraceCollector(module="virtual_fs")
    target = db.query(VirtualFileModel).filter(VirtualFileModel.path == payload.path).first()
    if not target:
        raise HTTPException(status_code=404, detail="File or directory not found")

    new_name = payload.new_name.strip()
    if not new_name or "/" in new_name:
        raise HTTPException(status_code=400, detail="Invalid new name: cannot contain '/'")

    parent = target.parent_path
    new_path = f"{parent}/{new_name}" if parent != "/" else f"/{new_name}"

    existing = db.query(VirtualFileModel).filter(VirtualFileModel.path == new_path).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Destination '{new_path}' already exists")

    old_path = target.path
    target.name = new_name
    target.path = new_path
    target.modified_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M")

    # If directory, re-parent children
    if target.is_directory:
        children = db.query(VirtualFileModel).filter(VirtualFileModel.parent_path == old_path).all()
        for c in children:
            c.parent_path = new_path
            c.path = f"{new_path}/{c.name}"

    collector.emit(
        simulation_time=1.0,
        operation="file_rename",
        entity=old_path,
        action="rename",
        reason=f"Renamed '{old_path}' to '{new_path}'.",
        explanation="Atomic directory entry rename executed. Child references updated if directory.",
        calculation={"old_path": old_path, "new_path": new_path, "new_name": new_name},
        state_before={"path": old_path, "name": target.name},
        state_after={"path": new_path, "name": new_name},
        affected_entities=[old_path, new_path],
        next_step="Sync directory tree"
    )

    execution_record = ExecutionModel(
        id=collector.execution_id,
        module="virtual_fs",
        algorithm="RENAME_NODE",
        status="COMPLETED",
        input_data=payload.model_dump(),
        result_data={"old_path": old_path, "new_path": new_path},
        summary_metrics={"renamed": True},
        trace_events=collector.get_events_dict(),
        total_steps=1
    )
    db.add(execution_record)
    db.commit()
    db.refresh(target)

    resp = VirtualFileResponse.model_validate(target)
    resp.execution_id = collector.execution_id
    resp.trace_events = collector.get_events()
    return resp

@router.delete("/")
def delete_virtual_file(path: str = Query(..., description="Path to delete"), db: Session = Depends(get_db)):
    collector = TraceCollector(module="virtual_fs")
    target = db.query(VirtualFileModel).filter(VirtualFileModel.path == path).first()
    if not target:
        raise HTTPException(status_code=404, detail="File or directory not found")

    deleted_paths = [target.path]
    # If directory, delete children too
    if target.is_directory:
        children = db.query(VirtualFileModel).filter(VirtualFileModel.parent_path.startswith(path)).all()
        for c in children:
            deleted_paths.append(c.path)
            db.delete(c)

    db.delete(target)

    collector.emit(
        simulation_time=1.0,
        operation="file_delete",
        entity=path,
        action="unlink_and_free",
        reason=f"Deleted virtual path '{path}' ({len(deleted_paths)} nodes purged).",
        explanation="Removed directory link and freed simulated inode block. Storage reclaimed.",
        calculation={"deleted_nodes": deleted_paths, "total_nodes_deleted": len(deleted_paths)},
        state_before={"exists": True, "path": path},
        state_after={"exists": False},
        affected_entities=deleted_paths,
        next_step="Reclaim directory tree entry"
    )

    execution_record = ExecutionModel(
        id=collector.execution_id,
        module="virtual_fs",
        algorithm="DELETE_NODE",
        status="COMPLETED",
        input_data={"path": path},
        result_data={"deleted_count": len(deleted_paths)},
        summary_metrics={"deleted_count": len(deleted_paths)},
        trace_events=collector.get_events_dict(),
        total_steps=1
    )
    db.add(execution_record)

    event = SystemEvent(
        module="FS",
        event="FILE_DELETED",
        severity="WARNING",
        description=f"Deleted virtual path {path} ({len(deleted_paths)} nodes purged) [Exec ID: {collector.execution_id}]."
    )
    db.add(event)
    db.commit()
    return {
        "status": "ok", 
        "message": f"Deleted {path}", 
        "execution_id": collector.execution_id,
        "trace_events": collector.get_events()
    }

@router.get("/storage", response_model=StorageInfoResponse)
def get_storage_stats(db: Session = Depends(get_db)):
    total_files = db.query(VirtualFileModel).count()
    all_files = db.query(VirtualFileModel).all()
    used_bytes = sum(f.size for f in all_files)
    
    total_bytes = 53687091200 # 50 GB
    free_bytes = total_bytes - used_bytes
    usage_percent = round((used_bytes / total_bytes) * 100, 2)

    return StorageInfoResponse(
        total_bytes=total_bytes,
        used_bytes=used_bytes,
        free_bytes=free_bytes,
        usage_percent=usage_percent,
        mount_point="/dev/sda1 (ext4)",
        filesystem_type="ext4",
        total_inodes=3276800,
        used_inodes=total_files
    )
