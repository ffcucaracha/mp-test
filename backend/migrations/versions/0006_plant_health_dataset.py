"""plant health analysis dataset

Revision ID: 0006_plant_health
Revises: 0005_crop_apiary_alerts
Create Date: 2026-09-08
"""

from alembic import op
import sqlalchemy as sa

revision = "0006_plant_health"
down_revision = "0005_crop_apiary_alerts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plant_health_analyses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("field_id", sa.Integer(), sa.ForeignKey("fields.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("crop_hint", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("image_data_url", sa.Text(), nullable=False),
        sa.Column("image_sha256", sa.String(length=64), nullable=False),
        sa.Column("predictions", sa.JSON(), nullable=False),
        sa.Column("top_label", sa.String(length=240), nullable=False),
        sa.Column("top_confidence", sa.Float(), nullable=False),
        sa.Column("feedback_status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("final_label", sa.String(length=240), nullable=True),
        sa.Column("posted_post_id", sa.Integer(), sa.ForeignKey("posts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("feedback_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_plant_health_analyses_user_id", "plant_health_analyses", ["user_id"])
    op.create_index("ix_plant_health_analyses_field_id", "plant_health_analyses", ["field_id"])
    op.create_index("ix_plant_health_analyses_provider", "plant_health_analyses", ["provider"])
    op.create_index("ix_plant_health_analyses_image_sha256", "plant_health_analyses", ["image_sha256"])
    op.create_index("ix_plant_health_analyses_feedback_status", "plant_health_analyses", ["feedback_status"])
    op.create_index("ix_plant_health_analyses_posted_post_id", "plant_health_analyses", ["posted_post_id"])
    op.create_index("ix_plant_health_analyses_created_at", "plant_health_analyses", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_plant_health_analyses_created_at", table_name="plant_health_analyses")
    op.drop_index("ix_plant_health_analyses_posted_post_id", table_name="plant_health_analyses")
    op.drop_index("ix_plant_health_analyses_feedback_status", table_name="plant_health_analyses")
    op.drop_index("ix_plant_health_analyses_image_sha256", table_name="plant_health_analyses")
    op.drop_index("ix_plant_health_analyses_provider", table_name="plant_health_analyses")
    op.drop_index("ix_plant_health_analyses_field_id", table_name="plant_health_analyses")
    op.drop_index("ix_plant_health_analyses_user_id", table_name="plant_health_analyses")
    op.drop_table("plant_health_analyses")
