
import import_declare_test

from splunktaucclib.rest_handler.endpoint import (
    field,
    validator,
    RestModel,
    MultipleModel,
)
from splunktaucclib.rest_handler import admin_external, util
from ta_kis_datagen_setup_handler import SetupHandler
import logging

util.remove_http_proxy_env_vars()


fields_hec_setup = [
    field.RestField(
        'send_mode',
        required=True,
        encrypted=False,
        default='hec',
        validator=None
    ), 
    field.RestField(
        'hec_url',
        required=False,
        encrypted=False,
        default=None,
        validator=validator.Pattern(
            regex=r"""^https://[^\s/]+(:\d+)?/?$""", 
        )
    ), 
    field.RestField(
        'hec_token',
        required=False,
        encrypted=True,
        default=None,
        validator=validator.Pattern(
            regex=r"""^([0-9a-fA-F-]{36}|\*+)$""", 
        )
    ), 
    field.RestField(
        'hec_verify_ssl',
        required=False,
        encrypted=False,
        default=1,
        validator=None
    ), 
    field.RestField(
        'hec_batch_size',
        required=False,
        encrypted=False,
        default='500',
        validator=validator.Number(
            max_val=5000, 
            min_val=10, 
        )
    )
]
model_hec_setup = RestModel(fields_hec_setup, name='hec_setup')


fields_logging = [
    field.RestField(
        'loglevel',
        required=True,
        encrypted=False,
        default='INFO',
        validator=validator.Pattern(
            regex=r"""^DEBUG|INFO|WARNING|ERROR|CRITICAL$""", 
        )
    )
]
model_logging = RestModel(fields_logging, name='logging')


endpoint = MultipleModel(
    'ta_kis_datagen_settings',
    models=[
        model_hec_setup, 
        model_logging
    ],
    need_reload=False,
)


if __name__ == '__main__':
    logging.getLogger().addHandler(logging.NullHandler())
    admin_external.handle(
        endpoint,
        handler=SetupHandler,
    )
