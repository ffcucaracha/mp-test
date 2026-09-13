"""farm-wide field visibility

Revision ID: 0010_farm_wide_field_visibility
Revises: 0009_farm_access_requests
Create Date: 2026-09-13
"""

from alembic import op
import sqlalchemy as sa


revision = "0010_farm_wide_field_visibility"
down_revision = "0009_farm_access_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("field_access_mode", sa.String(length=1), nullable=False, server_default="A"))
    # Existing mixed settings are made consistently cautious: if the farmer had
    # any protected field, all of that farmer's fields become protected.
    op.execute("""
        UPDATE users
        SET field_access_mode = CASE
            WHEN EXISTS (
                SELECT 1 FROM fields
                WHERE fields.owner_id = users.id AND fields.privacy_variant = 'B'
            ) THEN 'B'
            ELSE 'A'
        END
    """)
    op.execute("""
        UPDATE fields
        SET privacy_variant = users.field_access_mode
        FROM users
        WHERE fields.owner_id = users.id
    """)


def downgrade() -> None:
    op.drop_column("users", "field_access_mode")
