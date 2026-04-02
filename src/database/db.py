"""
ZODB Database connection and initialization
"""
import os
from ZODB import FileStorage, DB
import transaction
from .models import Database


# Global database instance
db_instance = None
storage = None


def init_database(db_path: str = "data/progcheck.fs"):
    """Initialize ZODB database"""
    global db_instance, storage
    
    try:
        # Create data directory if it doesn't exist
        dir_path = os.path.dirname(db_path) if os.path.dirname(db_path) else "."
        os.makedirs(dir_path, exist_ok=True)
        
        # Create storage and database
        storage = FileStorage.FileStorage(db_path)
        db_instance = DB(storage)
        
        # Initialize root database if empty
        connection = db_instance.open()
        root = connection.root()
        
        if 'database' not in root:
            root['database'] = Database()
            transaction.commit()
            print(f"✓ Database initialized at {db_path}")
        else:
            print(f"✓ Database loaded from {db_path}")
        
        connection.close()
    except Exception as e:
        print(f"✗ Database initialization failed: {e}")
        raise


def get_root():
    """Get database root object"""
    if db_instance is None:
        raise RuntimeError("Database not initialized. Call init_database() first.")
    
    connection = db_instance.open()
    return connection.root()['database'], connection


def close_database():
    """Close database connection"""
    global db_instance, storage
    if db_instance:
        db_instance.close()
    if storage:
        storage.close()
    print("✓ Database closed")


class DatabaseContext:
    """Context manager for database operations"""
    def __init__(self):
        self.connection = None
        self.root = None
    
    def __enter__(self):
        if db_instance is None:
            raise RuntimeError("Database not initialized")
        self.connection = db_instance.open()
        self.root = self.connection.root()['database']
        return self.root
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            transaction.abort()
        else:
            transaction.commit()
        if self.connection:
            self.connection.close()


def commit_changes():
    """Commit current transaction"""
    transaction.commit()


def abort_changes():
    """Abort current transaction"""
    transaction.abort()
