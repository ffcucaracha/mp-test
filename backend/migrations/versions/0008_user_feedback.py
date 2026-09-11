"""user feedback history

Revision ID: 0008_user_feedback
Revises: 0007_field_polygons
Create Date: 2026-09-11
"""

from alembic import op
import sqlalchemy as sa

revision = "0008_user_feedback"
down_revision = "0007_field_polygons"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_feedback",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("liked_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("improvement_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("local_network_score", sa.Integer(), nullable=False),
        sa.Column("field_diary_intent", sa.String(length=24), nullable=False),
        sa.Column("alerts_score", sa.Integer(), nullable=False),
        sa.Column("privacy_comfort_score", sa.Integer(), nullable=False),
        sa.Column("most_valuable_feature", sa.String(length=40), nullable=False),
        sa.Column("app_version", sa.String(length=64), nullable=False, server_default="mvp"),
        sa.Column("privacy_variant", sa.String(length=1), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_user_feedback_user_id", "user_feedback", ["user_id"])
    op.create_index("ix_user_feedback_created_at", "user_feedback", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_user_feedback_created_at", table_name="user_feedback")
    op.drop_index("ix_user_feedback_user_id", table_name="user_feedback")
    op.drop_table("user_feedback")
