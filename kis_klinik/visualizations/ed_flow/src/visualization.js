import '../../../shared/runtime.css';
import { createVisualization } from '../../../shared/runtime.js';
import { describe, toModel } from './model.js';
import { draw } from './render.js';

createVisualization({
    label: 'Notaufnahme-Fluss',
    toModel,
    describe,
    draw,
    animated: (model) => model.options.animate && model.total > 0,
});
