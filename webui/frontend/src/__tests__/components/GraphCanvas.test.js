/**
 * Tests for GraphCanvas.js
 *
 * Requirements traced:
 *   UFR-8   students see Prolog clause graph visualization
 *   SNFR-6  accessible via modern web browser
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import GraphCanvas from '../../components/GraphCanvas';

const NODES = [
  { id: 'n1', label: 'append/3', type: 'rule', x: null, y: null },
  { id: 'n2', label: 'Y', type: 'var', x: null, y: null },
];

const EDGES = [
  { id: 'e1', from: 'n1', to: 'n2', type: 'arg', label: 'arg1' },
];

describe('GraphCanvas', () => {
  test('renders without crashing with empty graph', () => {
    expect(() =>
      render(
        <GraphCanvas
          nodes={[]}
          edges={[]}
          width={800}
          height={500}
          onNodeDragEnd={jest.fn()}
          onEdgeRewire={jest.fn()}
          onNodeClick={jest.fn()}
        />
      )
    ).not.toThrow();
  });

  test('renders SVG element', () => {
    const { container } = render(
      <GraphCanvas
        nodes={NODES}
        edges={EDGES}
        width={800}
        height={500}
        onNodeDragEnd={jest.fn()}
        onEdgeRewire={jest.fn()}
        onNodeClick={jest.fn()}
      />
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });

  test('renders without crashing with nodes and edges', () => {
    expect(() =>
      render(
        <GraphCanvas
          nodes={NODES}
          edges={EDGES}
          width={800}
          height={500}
          onNodeDragEnd={jest.fn()}
          onEdgeRewire={jest.fn()}
          onNodeClick={jest.fn()}
        />
      )
    ).not.toThrow();
  });

  test('renders with selectedNodeId prop without crashing', () => {
    expect(() =>
      render(
        <GraphCanvas
          nodes={NODES}
          edges={EDGES}
          width={800}
          height={500}
          selectedNodeId="n1"
          onNodeDragEnd={jest.fn()}
          onEdgeRewire={jest.fn()}
          onNodeClick={jest.fn()}
        />
      )
    ).not.toThrow();
  });

  test('handles mouse down event without crashing', () => {
    const { container } = render(
      <GraphCanvas
        nodes={NODES}
        edges={EDGES}
        width={800}
        height={500}
        onNodeDragEnd={jest.fn()}
        onEdgeRewire={jest.fn()}
        onNodeClick={jest.fn()}
      />
    );
    const svg = container.querySelector('svg');
    if (svg) {
      expect(() => fireEvent.mouseDown(svg, { clientX: 100, clientY: 100 })).not.toThrow();
      expect(() => fireEvent.mouseUp(svg)).not.toThrow();
    }
  });

  test('renders different node types without crashing', () => {
    const mixedNodes = [
      { id: 'f1', label: 'base_case', type: 'fact', x: null, y: null },
      { id: 'r1', label: 'rule/2', type: 'rule', x: null, y: null },
      { id: 'a1', label: 'atom', type: 'atom', x: null, y: null },
      { id: 'v1', label: 'X', type: 'var', x: null, y: null },
    ];
    expect(() =>
      render(
        <GraphCanvas
          nodes={mixedNodes}
          edges={[]}
          width={800}
          height={500}
          onNodeDragEnd={jest.fn()}
          onEdgeRewire={jest.fn()}
          onNodeClick={jest.fn()}
        />
      )
    ).not.toThrow();
  });
});
