import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppHeaderComponent } from './layout/app-header.component';
import { AppFooterComponent } from './layout/app-footer.component';
import { TabNavComponent } from './layout/tab-nav.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, AppHeaderComponent, AppFooterComponent, TabNavComponent],
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100vh; }
    main  { flex: 1; overflow: auto; }
  `],
  template: `
    <app-header />
    <tab-nav />
    <main><router-outlet /></main>
    <app-footer />
  `,
})
export class AppComponent {}
