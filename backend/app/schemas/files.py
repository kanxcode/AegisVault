from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from app.schemas.trace import TraceEvent

class VirtualFileCreate(BaseModel):
    name: str
    parent_path: str = "/"
    is_directory: bool = False
    content: Optional[str] = ""
    permissions: str = "rw-r--r--"

class VirtualFileUpdateContent(BaseModel):
    path: str
    content: str

class VirtualFileRename(BaseModel):
    path: str
    new_name: str

class VirtualFileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: str
    name: str
    path: str
    parent_path: str
    is_directory: bool
    size: int
    permissions: str
    content: Optional[str] = None
    modified_at: str
    execution_id: Optional[str] = None
    trace_events: List[TraceEvent] = []

class StorageInfoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    total_bytes: int
    used_bytes: int
    free_bytes: int
    usage_percent: float
    mount_point: str
    filesystem_type: str
    total_inodes: int
    used_inodes: int
