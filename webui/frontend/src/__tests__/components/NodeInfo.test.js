/**
 * Jest tests for src/components/NodeInfo.js
 *
 * Requirements traced:
 *   UFR-9   students see proof trees and execution traces
 *   SNFR-6  system accessible via modern web browser
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import NodeInfo from '../../components/NodeInfo';

const baseNode = { id: 'pred:foo/2', label: 'foo', type: 'fact', arity: 2 };
const edges = [
  { id: 'e1', from: 'pred:bar/1', to: 'pred:foo/2', label: 'calls' },
  { id: 'e2', from: 'pred:foo/2', to: 'atom:a',    label: 'arg1' },
];

describe('NodeInfo', () => {
  test('renders nothing when node is null', () => {
    const { container } = render(<NodeInfo node={null} edges={[]} onClose={jest.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  test('renders node label', () => {
    render(<NodeInfo node={baseNode} edges={[]} onClose={jest.fn()} />);
    expect(screen.getByText(/foo/)).toBeInTheDocument();
  });

  test('shows Fact Predicate type label for fact type', () => {
    render(<NodeInfo node={baseNode} edges={[]} onClose={jest.fn()} />);
    expect(screen.getByText('Fact Predicate')).toBeInTheDocument();
  });

  test('shows Rule Predicate type label for rule type', () => {
    const ruleNode = { ...baseNode, type: 'rule' };
    render(<NodeInfo node={ruleNode} edges={[]} onClose={jest.fn()} />);
    expect(screen.getByText('Rule Predicate')).toBeInTheDocument();
  });

  test('shows Variable type label for var type', () => {
    const varNode = { ...baseNode, type: 'var' };
    render(<NodeInfo node={varNode} edges={[]} onClose={jest.fn()} />);
    expect(screen.getByText('Variable')).toBeInTheDocument();
  });

  test('shows Atom type label for atom type', () => {
    const atomNode = { ...baseNode, type: 'atom' };
    render(<NodeInfo node={atomNode} edges={[]} onClose={jest.fn()} />);
    expect(screen.getByText('Atom / Constant')).toBeInTheDocument();
  });

  test('shows "Referenced by" section when there are incoming edges', () => {
    render(<NodeInfo node={baseNode} edges={edges} onClose={jest.fn()} />);
    expect(screen.getByText(/referenced by/i)).toBeInTheDocument();
  });

  test('shows outgoing arguments section when there are outgoing edges', () => {
    render(<NodeInfo node={baseNode} edges={edges} onClose={jest.fn()} />);
    expect(screen.getAllByText(/arguments|calls/i).length).toBeGreaterThan(0);
  });

  test('calls onClose when × button clicked', () => {
    const onClose = jest.fn();
    render(<NodeInfo node={baseNode} edges={[]} onClose={onClose} />);
    fireEvent.click(screen.getByText('✕'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('no incoming section when no incoming edges', () => {
    render(<NodeInfo node={baseNode} edges={[]} onClose={jest.fn()} />);
    expect(screen.queryByText(/referenced by/i)).not.toBeInTheDocument();
  });

  test('no outgoing section when no outgoing edges', () => {
    render(<NodeInfo node={baseNode} edges={[]} onClose={jest.fn()} />);
    expect(screen.queryByText(/arguments/i)).not.toBeInTheDocument();
  });
});
