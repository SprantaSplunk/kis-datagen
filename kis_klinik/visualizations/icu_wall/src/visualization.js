import '../../../shared/runtime.css';
import { createVisualization } from '../../../shared/runtime.js';
import { describe, toModel } from './model.js';
import { draw } from './render.js';

createVisualization({
    label: 'Intensiv-Monitorwand',
    toModel,
    describe,
    draw,
    animated: (model) => model.options.showWave && model.beds.some((b) => !b.offline),
});
