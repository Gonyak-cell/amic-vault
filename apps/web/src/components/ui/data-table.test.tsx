import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableEmptyRow,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from './data-table';

describe('DataTable', () => {
  it('renders the enterprise dense table shell with caption and empty row', () => {
    const html = renderToStaticMarkup(
      <DataTable caption="운영 표">
        <DataTableHeader>
          <tr>
            <DataTableHead>이름</DataTableHead>
          </tr>
        </DataTableHeader>
        <DataTableBody>
          <DataTableRow>
            <DataTableCell>표시값</DataTableCell>
          </DataTableRow>
          <DataTableEmptyRow colSpan={1}>표시할 항목 없음</DataTableEmptyRow>
        </DataTableBody>
      </DataTable>,
    );

    expect(html).toContain('overflow-x-auto');
    expect(html).toContain('rounded-md');
    expect(html).toContain('bg-card');
    expect(html).toContain('min-w-[720px]');
    expect(html).toContain('운영 표');
    expect(html).toContain('표시할 항목 없음');
  });

  it('marks selectable rows with keyboard focus affordance', () => {
    const html = renderToStaticMarkup(
      <table>
        <tbody>
          <DataTableRow selected onSelect={() => undefined}>
            <DataTableCell>선택 가능</DataTableCell>
          </DataTableRow>
        </tbody>
      </table>,
    );

    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('hover:bg-muted/50');
  });
});
