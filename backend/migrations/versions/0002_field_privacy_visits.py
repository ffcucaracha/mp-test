"""field privacy and visit requests

Revision ID: 0002_field_privacy_visits
Revises: 0001_initial
Create Date: 2026-09-06
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_field_privacy_visits"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("fields", sa.Column("rotation", sa.Text(), nullable=False, server_default=""))
    op.add_column("fields", sa.Column("privacy_variant", sa.String(length=1), nullable=False, server_default="A"))

    op.create_table(
        "visit_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("field_id", sa.Integer(), sa.ForeignKey("fields.id", ondelete="CASCADE"), nullable=False),
        sa.Column("requester_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("message", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("field_id", "requester_id", name="uq_visit_request_field_requester"),
    )
    op.create_index("ix_visit_requests_field_id", "visit_requests", ["field_id"])
    op.create_index("ix_visit_requests_requester_id", "visit_requests", ["requester_id"])


def downgrade() -> None:
    op.drop_index("ix_visit_requests_requester_id", table_name="visit_requests")
    op.drop_index("ix_visit_requests_field_id", table_name="visit_requests")
    op.drop_table("visit_requests")
    op.drop_column("fields", "privacy_variant")
    op.drop_column("fields", "rotation")
