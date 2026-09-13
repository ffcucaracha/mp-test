"""store company weather stations and nearest station on fields"""
from alembic import op
import sqlalchemy as sa

revision = "0012_weather_stations"
down_revision = "0011_private_posts"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table("weather_stations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("external_id", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False, server_default=""),
        sa.Column("latitude", sa.Float(), nullable=False), sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("source_payload", sa.JSON(), nullable=False), sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_weather_stations_external_id", "weather_stations", ["external_id"], unique=True)
    op.create_index("ix_weather_stations_synced_at", "weather_stations", ["synced_at"])
    op.add_column("fields", sa.Column("weather_station_id", sa.Integer(), nullable=True))
    op.add_column("fields", sa.Column("weather_station_distance_km", sa.Float(), nullable=True))
    op.create_foreign_key("fk_fields_weather_station", "fields", "weather_stations", ["weather_station_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_fields_weather_station_id", "fields", ["weather_station_id"])

def downgrade() -> None:
    op.drop_index("ix_fields_weather_station_id", table_name="fields")
    op.drop_constraint("fk_fields_weather_station", "fields", type_="foreignkey")
    op.drop_column("fields", "weather_station_distance_km")
    op.drop_column("fields", "weather_station_id")
    op.drop_table("weather_stations")
