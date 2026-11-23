import '../../../shared/runtime.css';
import { createVisualization } from '../../../shared/runtime.js';
import { describe, toModel } from './model.js';
import { draw } from './render.js';

createVisualization({
    label: 'Blutdepot',
    toModel,
    describe,
    draw,
    animated: (model) => model.cells.some((c) => c.status !== 'ok'),
});
