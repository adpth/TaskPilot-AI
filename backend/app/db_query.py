import sys
import os
import hashlib
import hmac

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlmodel import Session, select
from database import engine
from models import User, ScheduleSlot

def run():
    print("Connecting to DB and checking users...")
    with Session(engine) as session:
        users = session.exec(select(User)).all()
        print(f"Total users found: {len(users)}")
        for u in users:
            token_candidate = hashlib.sha256(u.email.lower().strip().encode()).hexdigest()[:16]
            print(f"User ID: {u.id}, Email: '{u.email}', Feed Token DB: '{u.feed_token}', SHA256 Token: '{token_candidate}'")
            
            # Check slots for this user
            slots = session.exec(select(ScheduleSlot).where(ScheduleSlot.user_id == u.id)).all()
            print(f"  Slots count: {len(slots)}")
            
        print("\nChecking if feed token caaa64689c2792c0 matches any user...")
        target_token = "caaa64689c2792c0"
        target_user = session.exec(select(User).where(User.feed_token == target_token)).first()
        if target_user:
            print(f"Direct match found! User: {target_user.email}")
        else:
            print("No direct match found. Testing fallback candidates...")
            for u in users:
                token_candidate = hashlib.sha256(u.email.lower().strip().encode()).hexdigest()[:16]
                if hmac.compare_digest(token_candidate, target_token):
                    print(f"Fallback match found! User: {u.email}")
                    break
            else:
                print("No fallback match found either!")

if __name__ == "__main__":
    run()
