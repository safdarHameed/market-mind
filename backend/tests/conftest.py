import os

os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg://localhost:5432/signalhunter_test")
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["TAVILY_API_KEY"] = ""
os.environ["BRAVE_API_KEY"] = ""

import pytest  # noqa: E402

from app.db import Base, SessionLocal, engine, init_db  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    init_db()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    s = SessionLocal()
    yield s
    s.close()
