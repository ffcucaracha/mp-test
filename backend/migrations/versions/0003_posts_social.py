"""posts social core

Revision ID: 0003_posts_social
Revises: 0002_field_privacy_visits
Create Date: 2026-09-07
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_posts_social"
down_revision = "0002_field_privacy_visits"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("field_id", sa.Integer(), nullable=True))
    op.add_column("posts", sa.Column("status", sa.String(length=24), nullable=True))
    op.add_column("posts", sa.Column("photo_data_url", sa.Text(), nullable=True))
    op.add_column("posts", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("posts", sa.Column("longitude", sa.Float(), nullable=True))

    connection = op.get_bind()
    first_field_id = connection.execute(sa.text("SELECT id FROM fields ORDER BY id LIMIT 1")).scalar()
    if first_field_id is not None:
        connection.execute(
            sa.text(
                "UPDATE posts SET field_id = :field_id, status = 'problem', "
                "photo_data_url = 'data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\" width=\"800\" height=\"500\"%3E%3Crect width=\"100%25\" height=\"100%25\" fill=\"%23dce8d8\"/%3E%3Ctext x=\"50%25\" y=\"50%25\" dominant-baseline=\"middle\" text-anchor=\"middle\" font-size=\"36\" fill=\"%23436a49\"%3EAgroConnect%3C/text%3E%3C/svg%3E', "
                "latitude = (SELECT latitude FROM fields WHERE id = :field_id), "
                "longitude = (SELECT longitude FROM fields WHERE id = :field_id)"
            ),
            {"field_id": first_field_id},
        )

    op.alter_column("posts", "field_id", nullable=False)
    op.alter_column("posts", "status", nullable=False, server_default="problem")
    op.alter_column("posts", "photo_data_url", nullable=False)
    op.alter_column("posts", "latitude", nullable=False)
    op.alter_column("posts", "longitude", nullable=False)
    op.create_foreign_key("fk_posts_field_id", "posts", "fields", ["field_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_posts_field_id", "posts", ["field_id"])

    op.create_table(
        "reactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("post_id", sa.Integer(), sa.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("post_id", "user_id", name="uq_reaction_post_user"),
    )
    op.create_index("ix_reactions_post_id", "reactions", ["post_id"])
    op.create_index("ix_reactions_user_id", "reactions", ["user_id"])

    op.create_table(
        "comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("post_id", sa.Integer(), sa.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_comments_post_id", "comments", ["post_id"])
    op.create_index("ix_comments_author_id", "comments", ["author_id"])


def downgrade() -> None:
    op.drop_index("ix_comments_author_id", table_name="comments")
    op.drop_index("ix_comments_post_id", table_name="comments")
    op.drop_table("comments")
    op.drop_index("ix_reactions_user_id", table_name="reactions")
    op.drop_index("ix_reactions_post_id", table_name="reactions")
    op.drop_table("reactions")
    op.drop_index("ix_posts_field_id", table_name="posts")
    op.drop_constraint("fk_posts_field_id", "posts", type_="foreignkey")
    op.drop_column("posts", "longitude")
    op.drop_column("posts", "latitude")
    op.drop_column("posts", "photo_data_url")
    op.drop_column("posts", "status")
    op.drop_column("posts", "field_id")
