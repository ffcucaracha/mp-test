"""private feed posts

Revision ID: 0011_private_posts
Revises: 0010_farm_wide_field_visibility
Create Date: 2026-09-13
"""

from alembic import op
import sqlalchemy as sa


revision = "0011_private_posts"
down_revision = "0010_farm_wide_field_visibility"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("is_private", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index("ix_posts_is_private", "posts", ["is_private"])


def downgrade() -> None:
    op.drop_index("ix_posts_is_private", table_name="posts")
    op.drop_column("posts", "is_private")
