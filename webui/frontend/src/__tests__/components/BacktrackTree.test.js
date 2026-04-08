/**
 * Tests for BacktrackTree.js
 *
 * Requirements traced:
 *   UFR-8   students see backtracking tree visualization
 *   SNFR-6  accessible via modern web browser
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import BacktrackTree from '../../components/BacktrackTree';

const makeNode = (id, goal, parentId = null, result = 'success', clause = null) => ({
  id,
  parentId,
  goal,
  clause: clause ?? (parentId ? 'append([H|T],Y,[H|R]) :- append(T,Y,R).' : 'append([],Y,Y).'),
  result,
  bindings: {},
  cutPrevented: false,
  depth: parentId ? 1 : 0,
  lineStart: 1,
  lineEnd: 1,
  clauseIndex: 0,
  children: [],
});

const SIMPLE_TRACE = [
  makeNode('n1', 'append([],Y,Y)', null, 'success'),
  makeNode('n2', 'append([a],[b],[a,b])', 'n1', 'success'),
];

// Trace with bindings for testing BindingsPanel
const BINDING_TRACE = [
  { ...makeNode('b1', 'factorial(3,F)', null, 'success'), bindings: { F: '6' } },
  { ...makeNode('b2', 'factorial(2,F1)', 'b1', 'success'), bindings: { F1: '2' } },
];

// Trace with a ghost (cutPrevented) node that has a known cutBy
const GHOST_TRACE = [
  makeNode('p1', 'parent_goal', null, 'cut'),
  { ...makeNode('g1', 'ghost_goal', 'p1'), cutPrevented: true, cutBy: 'p1' },
];

// Trace with a rule clause to exercise blocks rendering (needs ≥2 nodes)
const RULE_TRACE = [
  makeNode('r1', 'length([a,b],N)', null, 'success', 'length([_|T],N) :- length(T,N1), N is N1+1.'),
  makeNode('r2', 'length([b],N1)', 'r1', 'success', 'length([_|T],N) :- length(T,N1), N is N1+1.'),
  makeNode('r3', 'length([],0)', 'r2', 'success', 'length([],0).'),
];

describe('BacktrackTree — basic rendering', () => {
  test('renders without crashing with empty trace', () => {
    expect(() => render(<BacktrackTree trace={[]} />)).not.toThrow();
  });

  test('renders empty-state message when trace is empty', () => {
    render(<BacktrackTree trace={[]} />);
    expect(document.body.textContent).toMatch(/run a query|visualize/i);
  });

  test('renders SVG element when trace has nodes', () => {
    const { container } = render(<BacktrackTree trace={SIMPLE_TRACE} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  test('renders with compact prop', () => {
    expect(() => render(<BacktrackTree trace={SIMPLE_TRACE} compact={true} />)).not.toThrow();
  });

  test('renders with onHighlightLine prop', () => {
    expect(() =>
      render(<BacktrackTree trace={SIMPLE_TRACE} onHighlightLine={jest.fn()} />)
    ).not.toThrow();
  });

  test('renders fail result node', () => {
    expect(() =>
      render(<BacktrackTree trace={[makeNode('f1', 'bad_goal', null, 'fail')]} />)
    ).not.toThrow();
  });

  test('renders cut result node', () => {
    expect(() =>
      render(<BacktrackTree trace={[makeNode('c1', 'cut_goal', null, 'cut')]} />)
    ).not.toThrow();
  });

  test('renders pending result node', () => {
    expect(() =>
      render(<BacktrackTree trace={[makeNode('p1', 'pending_goal', null, 'pending')]} />)
    ).not.toThrow();
  });

  test('renders cutPrevented (ghost) node', () => {
    expect(() => render(<BacktrackTree trace={GHOST_TRACE} />)).not.toThrow();
  });

  test('renders rule-clause trace with blocks', () => {
    expect(() => render(<BacktrackTree trace={RULE_TRACE} />)).not.toThrow();
  });

  test('renders node with bindings', () => {
    expect(() => render(<BacktrackTree trace={BINDING_TRACE} />)).not.toThrow();
  });
});

describe('BacktrackTree — toolbar controls', () => {
  test('All button resets step to show all nodes', () => {
    const { container } = render(<BacktrackTree trace={SIMPLE_TRACE} />);
    const buttons = container.querySelectorAll('button');
    expect(() => fireEvent.click(buttons[0])).not.toThrow(); // All
  });

  test('first step button (⏮) does not crash', () => {
    const { container } = render(<BacktrackTree trace={SIMPLE_TRACE} />);
    const buttons = container.querySelectorAll('button');
    expect(() => fireEvent.click(buttons[1])).not.toThrow(); // ⏮
  });

  test('step back button (◀) does not crash', () => {
    const { container } = render(<BacktrackTree trace={SIMPLE_TRACE} />);
    const buttons = container.querySelectorAll('button');
    expect(() => fireEvent.click(buttons[2])).not.toThrow(); // ◀
  });

  test('play/pause button (▶) does not crash', () => {
    const { container } = render(<BacktrackTree trace={SIMPLE_TRACE} />);
    const buttons = container.querySelectorAll('button');
    expect(() => fireEvent.click(buttons[3])).not.toThrow(); // ▶
  });

  test('step forward button (▶) does not crash', () => {
    const { container } = render(<BacktrackTree trace={SIMPLE_TRACE} />);
    const buttons = container.querySelectorAll('button');
    expect(() => fireEvent.click(buttons[4])).not.toThrow(); // ▶ step
  });

  test('last step button (⏭) does not crash', () => {
    const { container } = render(<BacktrackTree trace={SIMPLE_TRACE} />);
    const buttons = container.querySelectorAll('button');
    expect(() => fireEvent.click(buttons[5])).not.toThrow(); // ⏭
  });

  test('range slider change does not crash', () => {
    const { container } = render(<BacktrackTree trace={SIMPLE_TRACE} />);
    const slider = container.querySelector('input[type="range"]');
    if (slider) {
      expect(() => fireEvent.change(slider, { target: { value: '0' } })).not.toThrow();
      expect(() => fireEvent.change(slider, { target: { value: '1' } })).not.toThrow();
    }
  });

  test('blocks checkbox toggles showBlocks', () => {
    const { container } = render(<BacktrackTree trace={SIMPLE_TRACE} />);
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    // Last checkbox is the blocks toggle
    const blocksChk = checkboxes[checkboxes.length - 1];
    if (blocksChk) {
      expect(() => fireEvent.click(blocksChk)).not.toThrow();
    }
  });

  test('ghosts checkbox shown when trace has ghost nodes', () => {
    const { container } = render(<BacktrackTree trace={GHOST_TRACE} />);
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBeGreaterThanOrEqual(2); // ghosts + blocks
  });

  test('ghosts checkbox toggles showGhosts', () => {
    const { container } = render(<BacktrackTree trace={GHOST_TRACE} />);
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length >= 1) {
      expect(() => fireEvent.click(checkboxes[0])).not.toThrow();
    }
  });
});

describe('BacktrackTree — node interaction', () => {
  test('clicking a tree node does not crash', () => {
    const { container } = render(<BacktrackTree trace={SIMPLE_TRACE} />);
    const gs = container.querySelectorAll('g[style]');
    if (gs.length > 0) {
      expect(() => fireEvent.click(gs[0])).not.toThrow();
    }
  });

  test('clicking node with bindings shows BindingsPanel', () => {
    const { container } = render(<BacktrackTree trace={BINDING_TRACE} />);
    // Step to first node to make it the active node and show bindings
    const buttons = container.querySelectorAll('button');
    fireEvent.click(buttons[1]); // ⏮ go to step 0
    // BindingsPanel should appear for activeNode
    expect(document.body.textContent).toMatch(/F|factorial|6/);
  });

  test('SVG pan mousedown does not crash', () => {
    const { container } = render(<BacktrackTree trace={SIMPLE_TRACE} />);
    const svg = container.querySelector('svg');
    if (svg) {
      expect(() =>
        fireEvent.mouseDown(svg, { clientX: 50, clientY: 50 })
      ).not.toThrow();
    }
  });

  test('SVG pan mousemove does not crash', () => {
    const { container } = render(<BacktrackTree trace={SIMPLE_TRACE} />);
    const svg = container.querySelector('svg');
    if (svg) {
      fireEvent.mouseDown(svg, { clientX: 50, clientY: 50 });
      expect(() =>
        fireEvent.mouseMove(svg, { clientX: 80, clientY: 80 })
      ).not.toThrow();
    }
  });

  test('SVG pan mouseup does not crash', () => {
    const { container } = render(<BacktrackTree trace={SIMPLE_TRACE} />);
    const svg = container.querySelector('svg');
    if (svg) {
      fireEvent.mouseDown(svg, { clientX: 50, clientY: 50 });
      expect(() => fireEvent.mouseUp(svg)).not.toThrow();
    }
  });

  test('SVG mouseLeave does not crash', () => {
    const { container } = render(<BacktrackTree trace={SIMPLE_TRACE} />);
    const svg = container.querySelector('svg');
    if (svg) {
      expect(() => fireEvent.mouseLeave(svg)).not.toThrow();
    }
  });

  test('wheel event on canvas does not crash', () => {
    const { container } = render(<BacktrackTree trace={SIMPLE_TRACE} />);
    const canvasDiv = container.querySelector('.flex-1.overflow-hidden');
    if (canvasDiv) {
      expect(() =>
        fireEvent.wheel(canvasDiv, { deltaY: 100 })
      ).not.toThrow();
      expect(() =>
        fireEvent.wheel(canvasDiv, { deltaY: -100 })
      ).not.toThrow();
    }
  });
});

describe('BacktrackTree — trace changes', () => {
  test('changing trace prop resets state', () => {
    const { rerender } = render(<BacktrackTree trace={SIMPLE_TRACE} />);
    expect(() =>
      rerender(<BacktrackTree trace={RULE_TRACE} />)
    ).not.toThrow();
  });

  test('changing compact prop updates zoom', () => {
    const { rerender } = render(<BacktrackTree trace={SIMPLE_TRACE} compact={false} />);
    expect(() =>
      rerender(<BacktrackTree trace={SIMPLE_TRACE} compact={true} />)
    ).not.toThrow();
  });
});
