import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Use environment variable or default to local sqlite for initial dev if MySQL is down
# But we will aim for MySQL as requested.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./aegis.db")
# For MySQL it would be something like: "mysql+pymysql://user:pass@localhost:3306/aegis"

engine = create_engine(
    DATABASE_URL, 
    # check_same_thread only needed for sqlite
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
