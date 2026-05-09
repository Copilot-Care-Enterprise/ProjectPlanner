import { Component, inject } from '@angular/core';
import { AppStore } from '../store/app.store';

@Component({
  selector: 'app-header',
  standalone: true,
  styles: [`
    header {
      background: #1a1d2e;
      padding: .875rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand { display: flex; align-items: center; gap: .75rem; }
    .brand-name { font-size: 1.125rem; font-weight: 700; color: #fff; }
    .scenario-badge {
      font-size: .75rem; font-weight: 600; padding: .2rem .6rem;
      border-radius: 9999px;
    }
    .badge-baseline { background: #d1fae5; color: #065f46; }
    .badge-whatif   { background: #fef3c7; color: #92400e; }
    .actions { display: flex; align-items: center; gap: .5rem; }
  `],
  template: `
    <header>
      <div class="brand">
        <span style="font-size:1.25rem">📋</span>
        <span class="brand-name">{{ store.productName() }}</span>
        @if (store.activeScenario(); as sc) {
          <span class="scenario-badge" [class]="sc.isBaseline ? 'badge-baseline' : 'badge-whatif'">
            {{ sc.name }}
          </span>
        }
      </div>

    </header>
  `,
})
export class AppHeaderComponent {
  protected readonly store = inject(AppStore);
}
