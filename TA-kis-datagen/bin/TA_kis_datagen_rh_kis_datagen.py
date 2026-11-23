
import import_declare_test

from splunktaucclib.rest_handler.endpoint import (
    field,
    validator,
    RestModel,
    DataInputModel,
)
from splunktaucclib.rest_handler import admin_external, util
from splunktaucclib.rest_handler.admin_external import AdminExternalHandler
import logging

util.remove_http_proxy_env_vars()

SCENARIOS = ['flu_surge', 'blood_shortage', 'mri_cooling', 'hl7_queue', 'kis_db', 'network_building_c',
             'cisco_psirt']

special_fields = [
    field.RestField(
        'name',
        required=True,
        encrypted=False,
        default=None,
        validator=validator.AllOf(
            validator.Pattern(
                regex=r"""^[a-zA-Z]\w*$""",
            ),
            validator.String(
                max_len=100,
                min_len=1,
            )
        )
    )
]

fields = [
    field.RestField(
        'interval',
        required=True,
        encrypted=False,
        default='60',
        validator=validator.AllOf(
            validator.Pattern(
                regex=r"""^((?:-1|\d+(?:\.\d+)?)|(([\*\d{1,2}\,\-\/]+\s){4}[\*\d{1,2}\,\-\/]+))$""",
            ),
            validator.Number(
                max_val=300,
                min_val=30,
            )
        )
    ),
    field.RestField(
        'index',
        required=True,
        encrypted=False,
        default='demo_sakh',
        validator=validator.Pattern(
            regex=r"""^[a-zA-Z0-9][\w-]*$""",
        )
    ),
    field.RestField(
        'metrics_index',
        required=True,
        encrypted=False,
        default='demo_sakh_metrics',
        validator=validator.Pattern(
            regex=r"""^[a-zA-Z0-9][\w-]*$""",
        )
    ),
    field.RestField(
        'timezone',
        required=True,
        encrypted=False,
        default='Europe/Vienna',
        validator=validator.Pattern(
            regex=r"""^[A-Za-z_]+(/[A-Za-z_+-]+)*$""",
        )
    ),
    field.RestField(
        'seed',
        required=True,
        encrypted=False,
        default='sakh',
        validator=validator.Pattern(
            regex=r"""^[\w-]{1,32}$""",
        )
    ),
    field.RestField(
        'backfill_minutes',
        required=True,
        encrypted=False,
        default='1440',
        validator=validator.Number(
            max_val=10080,
            min_val=0,
        )
    ),
    field.RestField(
        'max_gap_minutes',
        required=True,
        encrypted=False,
        default='30',
        validator=validator.Number(
            max_val=1440,
            min_val=0,
        )
    ),
] + [
    field.RestField(
        'scenario_' + name,
        required=False,
        encrypted=False,
        default=0,
        validator=None
    ) for name in SCENARIOS
] + [
    field.RestField(
        'disabled',
        required=False,
        validator=None
    )
]
model = RestModel(fields, name=None, special_fields=special_fields)


endpoint = DataInputModel(
    'kis_datagen',
    model,
)


if __name__ == '__main__':
    logging.getLogger().addHandler(logging.NullHandler())
    admin_external.handle(
        endpoint,
        handler=AdminExternalHandler,
    )
