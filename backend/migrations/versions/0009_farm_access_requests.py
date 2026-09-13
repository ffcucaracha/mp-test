"""farm-wide neighbour access

Revision ID: 0009_farm_access_requests
Revises: 0008_user_feedback
Create Date: 2026-09-13
"""

from alembic import op
import sqlalchemy as sa


revision = "0009_farm_access_requests"
down_revision = "0008_user_feedback"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "farm_access_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("requester_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("message", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("owner_id", "requester_id", name="uq_farm_access_request_pair"),
    )
    op.create_index("ix_farm_access_requests_owner_id", "farm_access_requests", ["owner_id"])
    op.create_index("ix_farm_access_requests_requester_id", "farm_access_requests", ["requester_id"])

    op.drop_index("ix_visit_requests_requester_id", table_name="visit_requests")
    op.drop_index("ix_visit_requests_field_id", table_name="visit_requests")
    op.drop_table("visit_requests")


def downgrade() -> None:
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
    op.drop_index("ix_farm_access_requests_requester_id", table_name="farm_access_requests")
    op.drop_index("ix_farm_access_requests_owner_id", table_name="farm_access_requests")
    op.drop_table("farm_access_requests")
