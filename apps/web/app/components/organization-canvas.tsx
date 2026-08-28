'use client';

import { useMemo } from 'react';
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from '@xyflow/react';
import { Amount, FinoraIcon } from '@finora/ui';
import styles from './workspace-pages.module.css';

type OrganizationNode = Record<string, any>;

export function OrganizationCanvas({
  nodes,
  selectedId,
  collapsed,
  onSelect,
}: {
  nodes: OrganizationNode[];
  selectedId?: string;
  collapsed: Set<string>;
  onSelect: (id: string) => void;
}) {
  const graph = useMemo(() => {
    const children = new Map<string | null, OrganizationNode[]>();
    for (const node of nodes) {
      const key = node.parentId ?? null;
      children.set(key, [...(children.get(key) ?? []), node]);
    }
    const visible: Array<{ item: OrganizationNode; depth: number; row: number }> = [];
    let row = 0;
    const visit = (item: OrganizationNode, depth: number) => {
      visible.push({ item, depth, row: row++ });
      if (!collapsed.has(item.id))
        (children.get(item.id) ?? []).forEach((child) => visit(child, depth + 1));
    };
    (children.get(null) ?? []).forEach((root) => visit(root, 0));
    const visibleIds = new Set(visible.map(({ item }) => item.id));
    const flowNodes: Node[] = visible.map(({ item, depth, row: itemRow }) => {
      const limit = item.spendLimits?.find(
        (candidate: OrganizationNode) => candidate.status === 'ACTIVE',
      );
      return {
        id: item.id,
        position: { x: depth * 280, y: itemRow * 118 },
        className: `${styles.flowNode}${selectedId === item.id ? ` ${styles.flowNodeSelected}` : ''}`,
        data: {
          label: (
            <div className={styles.flowNodeContent}>
              <span>
                <FinoraIcon name={item.type === 'EMPLOYEE' ? 'account' : 'organization'} />
              </span>
              <div>
                <strong>{item.name}</strong>
                <small>
                  {String(item.type).replaceAll('_', ' ')} · {item.code}
                </small>
              </div>
              {limit ? (
                <b>
                  <Amount value={limit.amount} />
                </b>
              ) : (
                <em>No hard limit</em>
              )}
            </div>
          ),
        },
        draggable: false,
      };
    });
    const edges: Edge[] = visible
      .filter(({ item }) => item.parentId && visibleIds.has(item.parentId))
      .map(({ item }) => ({
        id: `${item.parentId}-${item.id}`,
        source: item.parentId,
        target: item.id,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#8da8ca' },
        style: { stroke: '#b8c9df', strokeWidth: 1.5 },
      }));
    return { flowNodes, edges };
  }, [collapsed, nodes, selectedId]);

  return (
    <div className={styles.canvas} aria-label="Organization hierarchy canvas">
      <ReactFlow
        nodes={graph.flowNodes}
        edges={graph.edges}
        onNodeClick={(_, node) => onSelect(node.id)}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.45}
        maxZoom={1.5}
        nodesConnectable={false}
        elementsSelectable
      >
        <Background color="#dce7f5" gap={22} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
