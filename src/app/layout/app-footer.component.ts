import { Component, inject } from '@angular/core';
import { AppStore } from '../store/app.store';

@Component({
  selector: 'app-footer',
  standalone: true,
  styles: [`
    footer {
      background: #1a1d2e;
      border-top: 1px solid #2d3348;
      padding: .625rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .status {
      font-size: .8125rem;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: .5rem;
    }
    .dirty-dot {
      width: .5rem;
      height: .5rem;
      border-radius: 50%;
      background: #facc15;
      display: inline-block;
      animation: pulse 1.5s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: .25; }
    }
    .saved-text { color: #4ade80; }
    .btn-save {
      padding: .4rem 1.25rem;
      border-radius: .375rem;
      font-size: .875rem;
      font-weight: 600;
      background: #16a34a;
      color: #fff;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: .4rem;
      transition: background .15s, opacity .15s, box-shadow .15s;
      box-shadow: 0 1px 3px rgba(0,0,0,.4);
    }
    .btn-save:hover:not(:disabled) {
      background: #15803d;
      box-shadow: 0 2px 6px rgba(0,0,0,.5);
    }
    .btn-save:disabled {
      opacity: .35;
      cursor: not-allowed;
      box-shadow: none;
    }
  `],
  template: `
    <footer>
      <span class="status">
        @if (store.isDirty()) {
          <span class="dirty-dot"></span>
          <span style="color:#fbbf24">Unsaved changes</span>
        } @else {
          <span class="saved-text">✓ All changes saved</span>
        }
      </span>

      <button class="btn-save" [disabled]="!store.isDirty()" (click)="onSave()">
        @if (store.isDirty()) { <span class="dirty-dot"></span> }
        Save
      </button>
    </footer>
  `,
})
export class AppFooterComponent {
  protected readonly store = inject(AppStore);
  onSave(): void { this.store.saveToLocalStorage(); }
}
