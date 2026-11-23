import '../../../shared/runtime.css';
import { createVisualization } from '../../../shared/runtime.js';
import { describe, toModel } from './model.js';
import { draw } from './render.js';

createVisualization({
    label: 'Klinik-Lageplan',
    toModel,
    describe,
    draw,
    animated: (model) => model.wards.some((w) => w.status === 'crit'),
});
