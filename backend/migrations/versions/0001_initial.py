"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-06
"""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("username", sa.String(length=80), nullable=False),
        sa.Column("region", sa.String(length=160), nullable=False, server_default=""),
        sa.Column("specialization", sa.String(length=160), nullable=False, server_default="Растениеводство"),
        sa.Column("farm_name", sa.String(length=180), nullable=False, server_default=""),
        sa.Column("bio", sa.Text(), nullable=False, server_default=""),
        sa.Column("is_beekeeper", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("news_radius_km", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("broadcast_radius_km", sa.Integer(), nullable=False, server_default="100"),
        sa.UniqueConstraint("username"),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "fields",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("crop", sa.String(length=120), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("area_ha", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_fields_owner_id", "fields", ["owner_id"])

    op.create_table(
        "posts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_posts_author_id", "posts", ["author_id"])


def downgrade() -> None:
    op.drop_index("ix_posts_author_id", table_name="posts")
    op.drop_table("posts")
    op.drop_index("ix_fields_owner_id", table_name="fields")
    op.drop_table("fields")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
