import '../../../shared/runtime.css';
import { createVisualization } from '../../../shared/runtime.js';
import { describe, toModel } from './model.js';
import { draw } from './render.js';

createVisualization({
    label: 'Service-Abhaengigkeiten',
    toModel,
    describe,
    draw,
    animated: (model) => model.nodes.some((n) => n.own === 'crit'),
});
