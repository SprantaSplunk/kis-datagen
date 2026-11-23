import import_declare_test

import sys

from splunklib import modularinput as smi
from kis_datagen_helper import stream_events, validate_input
from kis_sim.scenarios import NAMES as SCENARIOS


class KIS_DATAGEN(smi.Script):
    def __init__(self):
        super(KIS_DATAGEN, self).__init__()

    def get_scheme(self):
        scheme = smi.Scheme('kis_datagen')
        scheme.description = 'SAKH Krankenhaus (KIS, Medizintechnik, IT-Infrastruktur)'
        scheme.use_external_validation = True
        scheme.streaming_mode_xml = True
        scheme.use_single_instance = False

        scheme.add_argument(smi.Argument('name', title='Name', description='Name', required_on_create=True))
        for arg in ('metrics_index', 'timezone', 'seed', 'backfill_minutes', 'max_gap_minutes'):
            scheme.add_argument(smi.Argument(arg, required_on_create=True))
        for name in SCENARIOS:
            scheme.add_argument(smi.Argument('scenario_' + name, required_on_create=False))
        return scheme

    def validate_input(self, definition: smi.ValidationDefinition):
        return validate_input(definition)

    def stream_events(self, inputs: smi.InputDefinition, ew: smi.EventWriter):
        return stream_events(inputs, ew)


if __name__ == '__main__':
    exit_code = KIS_DATAGEN().run(sys.argv)
    sys.exit(exit_code)
