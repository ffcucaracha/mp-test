"""analytics and neighbors

Revision ID: 0004_analytics_neighbors
Revises: 0003_posts_social
Create Date: 2026-09-07
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_analytics_neighbors"
down_revision = "0003_posts_social"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "neighbors",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("neighbor_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "neighbor_user_id", name="uq_neighbor_pair"),
    )
    op.create_index("ix_neighbors_user_id", "neighbors", ["user_id"])
    op.create_index("ix_neighbors_neighbor_user_id", "neighbors", ["neighbor_user_id"])

    op.create_table(
        "product_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_name", sa.String(length=80), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("experiment_variant", sa.String(length=32), nullable=True),
        sa.Column("properties", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_product_events_event_name", "product_events", ["event_name"])
    op.create_index("ix_product_events_user_id", "product_events", ["user_id"])
    op.create_index("ix_product_events_experiment_variant", "product_events", ["experiment_variant"])
    op.create_index("ix_product_events_created_at", "product_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_product_events_created_at", table_name="product_events")
    op.drop_index("ix_product_events_experiment_variant", table_name="product_events")
    op.drop_index("ix_product_events_user_id", table_name="product_events")
    op.drop_index("ix_product_events_event_name", table_name="product_events")
    op.drop_table("product_events")
    op.drop_index("ix_neighbors_neighbor_user_id", table_name="neighbors")
    op.drop_index("ix_neighbors_user_id", table_name="neighbors")
    op.drop_table("neighbors")
