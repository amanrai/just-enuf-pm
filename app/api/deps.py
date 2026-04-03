from fastapi import Depends
from sqlalchemy.orm import Session

from app.db import get_session


SessionDep = Depends(get_session)
