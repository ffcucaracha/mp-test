"""field polygons

Revision ID: 0007_field_polygons
Revises: 0006_plant_health
Create Date: 2026-09-09
"""

from alembic import op
import sqlalchemy as sa

revision = "0007_field_polygons"
down_revision = "0006_plant_health"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("fields", sa.Column("geometry", sa.JSON(), nullable=True))
    op.execute(
        """
        UPDATE fields
        SET geometry = json_build_object(
            'type', 'Polygon',
            'coordinates', json_build_array(json_build_array(
                json_build_array(longitude - 0.0005, latitude - 0.0005),
                json_build_array(longitude + 0.0005, latitude - 0.0005),
                json_build_array(longitude + 0.0005, latitude + 0.0005),
                json_build_array(longitude - 0.0005, latitude + 0.0005),
                json_build_array(longitude - 0.0005, latitude - 0.0005)
            ))
        )
        WHERE geometry IS NULL
        """
    )
    op.alter_column("fields", "geometry", existing_type=sa.JSON(), nullable=False)


def downgrade() -> None:
    op.drop_column("fields", "geometry")
