from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, JSON, Boolean
from datetime import datetime
from app.models.base import Base

class SystemEvent(Base):
    __tablename__ = "system_events"
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    module = Column(String(50), index=True)  # PROC, MEM, CPU, DISK, DB, FS, SYS
    event = Column(String(100), index=True)
    severity = Column(String(20)) # INFO, WARNING, ERROR
    description = Column(Text)
    execution_id = Column(String(64), nullable=True, index=True)
    step_number = Column(Integer, nullable=True)
    status = Column(String(20), default="SUCCESS")
    entity = Column(String(100), nullable=True)

class SchedulingRun(Base):
    __tablename__ = "scheduling_runs"
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    algorithm = Column(String(50))
    quantum = Column(Integer, nullable=True)
    cpu_utilization = Column(Float)
    average_waiting_time = Column(Float)
    average_turnaround_time = Column(Float)
    average_response_time = Column(Float, default=0.0)
    
    gantt_data = Column(JSON)
    process_data = Column(JSON)

class MemoryAllocationRun(Base):
    __tablename__ = "memory_allocation_runs"
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    algorithm = Column(String(50))
    allocated_memory = Column(Integer)
    free_memory = Column(Integer)
    fragmentation = Column(Integer)
    
    allocations = Column(JSON)
    unallocated_processes = Column(JSON)

class DiskSchedulingRun(Base):
    __tablename__ = "disk_scheduling_runs"
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    algorithm = Column(String(50))
    total_head_movement = Column(Integer)
    average_seek_distance = Column(Float)
    
    service_order = Column(JSON)
    movement_path = Column(JSON)

class ProcessModel(Base):
    __tablename__ = "processes"
    
    id = Column(Integer, primary_key=True, index=True)
    pid = Column(String(20), unique=True, index=True)
    name = Column(String(100))
    state = Column(String(20)) # NEW, READY, RUNNING, WAITING, TERMINATED
    arrival_time = Column(Integer, default=0)
    burst_time = Column(Integer, default=10)
    priority = Column(Integer, default=1)
    cpu_time = Column(Integer, default=0)
    memory = Column(Integer, default=128) # in MB
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class DiskRequestModel(Base):
    __tablename__ = "disk_requests"
    
    id = Column(String(20), primary_key=True, index=True)
    track = Column(Integer)
    sector = Column(Integer)
    status = Column(String(20), default="PENDING") # PENDING, SERVICED
    created_at = Column(DateTime, default=datetime.utcnow)

class MemoryBlockModel(Base):
    __tablename__ = "memory_blocks"
    
    id = Column(String(20), primary_key=True, index=True)
    start_address = Column(String(20))
    size = Column(Integer) # in MB
    status = Column(String(20), default="FREE") # FREE, ALLOCATED
    process_id = Column(String(20), nullable=True)

class VirtualFileModel(Base):
    __tablename__ = "virtual_files"
    
    id = Column(String(50), primary_key=True, index=True)
    name = Column(String(255))
    path = Column(String(500), unique=True, index=True)
    parent_path = Column(String(500), index=True)
    is_directory = Column(Boolean, default=False)
    size = Column(Integer, default=0) # bytes
    permissions = Column(String(20), default="rw-r--r--")
    content = Column(Text, nullable=True)
    modified_at = Column(String(50))

class TransactionModel(Base):
    __tablename__ = "db_transactions"
    
    id = Column(String(50), primary_key=True, index=True)
    status = Column(String(20), default="ACTIVE") # ACTIVE, COMMITTED, ROLLED_BACK
    query = Column(Text)
    duration_ms = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

class LockModel(Base):
    __tablename__ = "db_locks"
    
    id = Column(Integer, primary_key=True, index=True)
    tx_id = Column(String(50), index=True)
    resource = Column(String(100))
    lock_type = Column(String(20)) # SHARED, EXCLUSIVE
    created_at = Column(DateTime, default=datetime.utcnow)

# Application schema tables for DBMS Explorer & SQL Console
class UserModel(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True)
    password_hash = Column(String(255))
    role = Column(String(50), default="OPERATOR")
    last_login = Column(DateTime, nullable=True)

class SessionModel(Base):
    __tablename__ = "sessions"
    
    id = Column(String(64), primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    token = Column(String(255))
    expires_at = Column(DateTime)

class AuditLogModel(Base):
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    user_id = Column(Integer, nullable=True)
    action = Column(String(100))
    ip_address = Column(String(50))

class SystemConfigModel(Base):
    __tablename__ = "system_config"
    
    key = Column(String(100), primary_key=True, index=True)
    value = Column(Text)
    updated_at = Column(DateTime, default=datetime.utcnow)
    updated_by = Column(String(50))

class ExecutionModel(Base):
    __tablename__ = "executions"
    
    id = Column(String(64), primary_key=True, index=True) # execution_id
    module = Column(String(50), index=True)
    algorithm = Column(String(50), index=True)
    status = Column(String(20), default="COMPLETED")
    input_data = Column(JSON)
    result_data = Column(JSON)
    summary_metrics = Column(JSON)
    trace_events = Column(JSON)
    total_steps = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
