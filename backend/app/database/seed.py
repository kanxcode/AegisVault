from datetime import datetime, timedelta
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.models.simulation import (
    ProcessModel, DiskRequestModel, MemoryBlockModel, VirtualFileModel,
    TransactionModel, LockModel, UserModel, SessionModel, AuditLogModel,
    SystemConfigModel, SystemEvent
)

def seed_database(db: Session):
    # 1. Seed Users
    if db.query(UserModel).count() == 0:
        users = [
            UserModel(id=1, username="admin_sys", password_hash="$2b$12$e8YQj0k2cZ...", role="ADMIN", last_login=datetime.utcnow() - timedelta(minutes=15)),
            UserModel(id=42, username="neo", password_hash="$2b$12$Z0bKm7e5...", role="ADMIN", last_login=datetime.utcnow() - timedelta(hours=2)),
            UserModel(id=103, username="cipher", password_hash="$2b$12$N9m3k8Lq...", role="OPERATOR", last_login=datetime.utcnow() - timedelta(days=1)),
            UserModel(id=204, username="sentinel_daemon", password_hash="$2b$12$P2p91lKm...", role="SERVICE", last_login=datetime.utcnow() - timedelta(minutes=2)),
        ]
        db.add_all(users)
        db.commit()

    # 2. Seed Sessions
    if db.query(SessionModel).count() == 0:
        sessions = [
            SessionModel(id="sess_01a", user_id=1, token="aegis_tk_8f91c9e8", expires_at=datetime.utcnow() + timedelta(hours=8)),
            SessionModel(id="sess_42b", user_id=42, token="aegis_tk_2e47a11f", expires_at=datetime.utcnow() + timedelta(hours=4)),
            SessionModel(id="sess_svc", user_id=204, token="aegis_tk_99f30aa2", expires_at=datetime.utcnow() + timedelta(days=30)),
        ]
        db.add_all(sessions)
        db.commit()

    # 3. Seed Audit Logs
    if db.query(AuditLogModel).count() == 0:
        logs = [
            AuditLogModel(user_id=1, action="SECURITY_OVERRIDE_ENABLED", ip_address="10.0.4.12", timestamp=datetime.utcnow() - timedelta(hours=1)),
            AuditLogModel(user_id=42, action="NODE_ENCRYPTION_KEY_ROTATED", ip_address="10.0.4.18", timestamp=datetime.utcnow() - timedelta(hours=2)),
            AuditLogModel(user_id=103, action="VAULT_PARTITION_SCAN", ip_address="192.168.1.105", timestamp=datetime.utcnow() - timedelta(hours=4)),
            AuditLogModel(user_id=204, action="SERVICE_HEARTBEAT_ACK", ip_address="127.0.0.1", timestamp=datetime.utcnow() - timedelta(minutes=5)),
        ]
        db.add_all(logs)
        db.commit()

    # 4. Seed System Config
    if db.query(SystemConfigModel).count() == 0:
        configs = [
            SystemConfigModel(key="admin_access", value="RESTRICTED_MFA", updated_by="admin_sys", updated_at=datetime.utcnow()),
            SystemConfigModel(key="vault_stealth_mode", value="ENABLED_LEVEL_4", updated_by="admin_sys", updated_at=datetime.utcnow()),
            SystemConfigModel(key="node_encryption", value="AES-256-GCM", updated_by="neo", updated_at=datetime.utcnow()),
            SystemConfigModel(key="max_concurrent_workers", value="16", updated_by="admin_sys", updated_at=datetime.utcnow()),
        ]
        db.add_all(configs)
        db.commit()

    # 5. Seed Processes
    if db.query(ProcessModel).count() == 0:
        procs = [
            ProcessModel(pid="P101", name="kernel_task", state="RUNNING", arrival_time=0, burst_time=120, priority=0, cpu_time=42, memory=512),
            ProcessModel(pid="P102", name="sys_monitor", state="READY", arrival_time=2, burst_time=45, priority=1, cpu_time=10, memory=128),
            ProcessModel(pid="P103", name="db_worker_01", state="WAITING", arrival_time=5, burst_time=300, priority=2, cpu_time=120, memory=1024),
            ProcessModel(pid="P104", name="db_worker_02", state="READY", arrival_time=7, burst_time=300, priority=2, cpu_time=85, memory=1024),
            ProcessModel(pid="P105", name="log_drain", state="TERMINATED", arrival_time=1, burst_time=15, priority=3, cpu_time=15, memory=64),
            ProcessModel(pid="P106", name="auth_service", state="WAITING", arrival_time=12, burst_time=80, priority=1, cpu_time=25, memory=256),
            ProcessModel(pid="P107", name="query_opt", state="READY", arrival_time=15, burst_time=150, priority=2, cpu_time=0, memory=512),
        ]
        db.add_all(procs)
        db.commit()

    # 6. Seed Memory Blocks
    if db.query(MemoryBlockModel).count() == 0:
        blocks = [
            MemoryBlockModel(id="m1", start_address="0x0000", size=1024, status="ALLOCATED", process_id="P101"),
            MemoryBlockModel(id="m2", start_address="0x0400", size=512, status="FREE", process_id=None),
            MemoryBlockModel(id="m3", start_address="0x0600", size=256, status="ALLOCATED", process_id="P102"),
            MemoryBlockModel(id="m4", start_address="0x0700", size=128, status="FREE", process_id=None),
            MemoryBlockModel(id="m5", start_address="0x0780", size=2048, status="ALLOCATED", process_id="P103"),
            MemoryBlockModel(id="m6", start_address="0x0F80", size=1024, status="FREE", process_id=None),
        ]
        db.add_all(blocks)
        db.commit()

    # 7. Seed Disk Requests
    if db.query(DiskRequestModel).count() == 0:
        reqs = [
            DiskRequestModel(id="d1", track=45, sector=12, status="SERVICED"),
            DiskRequestModel(id="d2", track=12, sector=4, status="SERVICED"),
            DiskRequestModel(id="d3", track=89, sector=2, status="PENDING"),
            DiskRequestModel(id="d4", track=34, sector=8, status="PENDING"),
            DiskRequestModel(id="d5", track=67, sector=1, status="PENDING"),
        ]
        db.add_all(reqs)
        db.commit()

    # 8. Seed Virtual Files
    if db.query(VirtualFileModel).count() == 0:
        vfiles = [
            VirtualFileModel(id="f1", name="root", path="/root", parent_path="/", is_directory=True, size=4096, permissions="rwxr-x---", modified_at="2026-09-24 10:00", content=None),
            VirtualFileModel(id="f1_keys", name="keys.asc", path="/root/keys.asc", parent_path="/root", is_directory=False, size=2048, permissions="rw-------", modified_at="2026-09-24 10:12", content="-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: AegisVault-Crypto 2.1\n[SECURE_PAYLOAD_PROTECTED]\n-----END PGP PRIVATE KEY BLOCK-----"),
            VirtualFileModel(id="f2", name="bin", path="/bin", parent_path="/", is_directory=True, size=4096, permissions="rwxr-xr-x", modified_at="2026-09-24 10:00", content=None),
            VirtualFileModel(id="f3", name="etc", path="/etc", parent_path="/", is_directory=True, size=4096, permissions="rwxr-xr-x", modified_at="2026-09-24 10:00", content=None),
            VirtualFileModel(id="f4", name="aegis.conf", path="/etc/aegis.conf", parent_path="/etc", is_directory=False, size=1024, permissions="rw-r--r--", modified_at="2026-09-24 11:30", content="[core]\nmode = covert_agent\nencryption = aes256_gcm\nstealth = active\nsync_interval = 250ms"),
            VirtualFileModel(id="f5", name="db.conf", path="/etc/db.conf", parent_path="/etc", is_directory=False, size=512, permissions="rw-------", modified_at="2026-09-24 11:31", content="[database]\nhost = 127.0.0.1\nport = 3306\npool_size = 20\ntimeout = 3000ms"),
            VirtualFileModel(id="f6", name="var", path="/var", parent_path="/", is_directory=True, size=4096, permissions="rwxr-xr-x", modified_at="2026-09-24 10:00", content=None),
            VirtualFileModel(id="f7", name="log", path="/var/log", parent_path="/var", is_directory=True, size=4096, permissions="rwxr-xr-x", modified_at="2026-09-24 12:00", content=None),
            VirtualFileModel(id="f8", name="syslog", path="/var/log/syslog", parent_path="/var/log", is_directory=False, size=15420, permissions="rw-r--r--", modified_at="2026-09-24 12:42", content="Sep 24 12:40:01 node-01 kernel: [BOOT] AegisVault kernel started.\nSep 24 12:40:02 node-01 systemd[1]: Reached target Security Level 5.\nSep 24 12:42:08 node-01 proc[101]: Process P101 created successfully."),
            VirtualFileModel(id="f9", name="auth.log", path="/var/log/auth.log", parent_path="/var/log", is_directory=False, size=4096, permissions="rw-------", modified_at="2026-09-24 12:40", content="Sep 24 12:40:15 node-01 sshd[420]: Accepted publickey for neo from 10.0.4.18 port 51224 ssh2"),
        ]
        db.add_all(vfiles)
        db.commit()

    # 9. Seed Transactions
    if db.query(TransactionModel).count() == 0:
        txs = [
            TransactionModel(id="TX-00820", status="COMMITTED", query="UPDATE users SET last_login = NOW() WHERE id = 42", duration_ms=12),
            TransactionModel(id="TX-00821", status="COMMITTED", query="INSERT INTO audit_logs (user_id, action) VALUES (42, 'LOGIN')", duration_ms=8),
            TransactionModel(id="TX-00822", status="ACTIVE", query="SELECT * FROM sessions WHERE expires_at < NOW()", duration_ms=45),
            TransactionModel(id="TX-00823", status="ROLLED_BACK", query="DELETE FROM system_config WHERE key = 'admin_access'", duration_ms=120),
        ]
        db.add_all(txs)
        db.commit()

    # 10. Seed Locks
    if db.query(LockModel).count() == 0:
        locks = [
            LockModel(tx_id="TX-00822", resource="sessions_tbl", lock_type="SHARED"),
            LockModel(tx_id="TX-00820", resource="users_tbl", lock_type="EXCLUSIVE"),
        ]
        db.add_all(locks)
        db.commit()

    # 11. Seed initial Events
    if db.query(SystemEvent).count() == 0:
        events = [
            SystemEvent(module="PROC", event="PROCESS_CREATED", severity="INFO", description="Process P101 created successfully."),
            SystemEvent(module="MEM", event="MEMORY_ALLOCATED", severity="INFO", description="Allocated 512MB to P101 (BLOCK 04)."),
            SystemEvent(module="CPU", event="SCHEDULER_EXEC", severity="INFO", description="Round Robin / Quantum 4 initiated."),
            SystemEvent(module="PROC", event="STATE_TRANSITION", severity="INFO", description="P105 transitioned RUNNING -> TERMINATED."),
            SystemEvent(module="DB", event="DB_TRANSACTION", severity="INFO", description="Transaction TX-00821 COMMITTED."),
            SystemEvent(module="DISK", event="DISK_REQUEST", severity="WARNING", description="High I/O latency on Sector 7."),
        ]
        db.add_all(events)
        db.commit()

    # 12. Ensure read-only analytical SQL views exist for Database Observatory discovery
    try:
        dialect_name = db.bind.dialect.name if db.bind else "sqlite"
        if dialect_name == "sqlite":
            db.execute(text(
                "CREATE VIEW IF NOT EXISTS v_active_sessions AS "
                "SELECT s.id AS session_id, u.username, u.role, s.expires_at "
                "FROM sessions s JOIN users u ON s.user_id = u.id"
            ))
            db.execute(text(
                "CREATE VIEW IF NOT EXISTS v_active_processes AS "
                "SELECT pid, name, state, priority, burst_time, cpu_time, memory "
                "FROM processes WHERE state != 'TERMINATED'"
            ))
        else:
            db.execute(text(
                "CREATE OR REPLACE VIEW v_active_sessions AS "
                "SELECT s.id AS session_id, u.username, u.role, s.expires_at "
                "FROM sessions s JOIN users u ON s.user_id = u.id"
            ))
            db.execute(text(
                "CREATE OR REPLACE VIEW v_active_processes AS "
                "SELECT pid, name, state, priority, burst_time, cpu_time, memory "
                "FROM processes WHERE state != 'TERMINATED'"
            ))
        db.commit()
    except Exception:
        db.rollback()
