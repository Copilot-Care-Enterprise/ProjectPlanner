import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'tab-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  styles: [`
    nav        { background: #242840; padding: 0 1.5rem; display: flex; }
    a          { display: inline-flex; align-items: center; padding: .75rem 1.125rem; font-size: .875rem; font-weight: 500; color: #94a3b8; border-bottom: 2px solid transparent; text-decoration: none; white-space: nowrap; transition: color .15s, border-color .15s; }
    a:hover    { color: #e2e8f0; }
    a.active   { color: #fff; border-bottom-color: #2563eb; }
  `],
  template: `
    <nav>
      @for (tab of tabs; track tab.path) {
        <a [routerLink]="tab.path" routerLinkActive="active" [routerLinkActiveOptions]="{exact:false}">{{ tab.label }}</a>
      }
    </nav>
  `,
})
export class TabNavComponent {
  protected readonly tabs = [
    { label: 'Setup',    path: '/setup' },
    { label: 'Streams',  path: '/streams' },
    { label: 'Projects', path: '/projects' },
    { label: 'Planning', path: '/planning' },
    { label: 'What-if',  path: '/whatif' },
  ];
}
