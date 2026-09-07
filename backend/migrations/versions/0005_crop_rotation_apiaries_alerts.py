"""crop rotation apiaries and alerts

Revision ID: 0005_crop_rotation_apiaries_alerts
Revises: 0004_analytics_neighbors
Create Date: 2026-09-07
"""

from alembic import op
import sqlalchemy as sa

revision = "0005_crop_rotation_apiaries_alerts"
down_revision = "0004_analytics_neighbors"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crop_seasons",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("field_id", sa.Integer(), sa.ForeignKey("fields.id", ondelete="CASCADE"), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("crop", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("field_id", "year", name="uq_crop_season_field_year"),
    )
    op.create_index("ix_crop_seasons_field_id", "crop_seasons", ["field_id"])

    op.create_table(
        "apiaries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("alert_radius_km", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_apiaries_owner_id", "apiaries", ["owner_id"])

    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("field_id", sa.Integer(), sa.ForeignKey("fields.id", ondelete="SET NULL"), nullable=True),
        sa.Column("type", sa.String(length=24), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("radius_km", sa.Integer(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_alerts_author_id", "alerts", ["author_id"])
    op.create_index("ix_alerts_field_id", "alerts", ["field_id"])
    op.create_index("ix_alerts_type", "alerts", ["type"])
    op.create_index("ix_alerts_created_at", "alerts", ["created_at"])

    op.create_table(
        "alert_recipients",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("alert_id", sa.Integer(), sa.ForeignKey("alerts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("apiary_id", sa.Integer(), sa.ForeignKey("apiaries.id", ondelete="SET NULL"), nullable=True),
        sa.Column("distance_km", sa.Float(), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("alert_id", "user_id", "apiary_id", name="uq_alert_recipient_apiary"),
    )
    op.create_index("ix_alert_recipients_alert_id", "alert_recipients", ["alert_id"])
    op.create_index("ix_alert_recipients_user_id", "alert_recipients", ["user_id"])
    op.create_index("ix_alert_recipients_apiary_id", "alert_recipients", ["apiary_id"])


def downgrade() -> None:
    op.drop_index("ix_alert_recipients_apiary_id", table_name="alert_recipients")
    op.drop_index("ix_alert_recipients_user_id", table_name="alert_recipients")
    op.drop_index("ix_alert_recipients_alert_id", table_name="alert_recipients")
    op.drop_table("alert_recipients")

    op.drop_index("ix_alerts_created_at", table_name="alerts")
    op.drop_index("ix_alerts_type", table_name="alerts")
    op.drop_index("ix_alerts_field_id", table_name="alerts")
    op.drop_index("ix_alerts_author_id", table_name="alerts")
    op.drop_table("alerts")

    op.drop_index("ix_apiaries_owner_id", table_name="apiaries")
    op.drop_table("apiaries")

    op.drop_index("ix_crop_seasons_field_id", table_name="crop_seasons")
    op.drop_table("crop_seasons")
