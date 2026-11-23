import '../../../shared/runtime.css';
import { createVisualization } from '../../../shared/runtime.js';
import { describe, toModel } from './model.js';
import { draw } from './render.js';

createVisualization({
    label: 'Health rings',
    toModel,
    describe,
    draw,
    animated: (model) => model.items.some((item) => item.status === 'crit'),
});
