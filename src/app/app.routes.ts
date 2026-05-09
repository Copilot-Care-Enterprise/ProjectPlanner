import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'setup', pathMatch: 'full' },
  {
    path: 'setup',
    loadComponent: () => import('./features/setup/setup.component').then(m => m.SetupComponent),
  },
  {
    path: 'streams',
    loadComponent: () => import('./features/streams/streams.component').then(m => m.StreamsComponent),
  },
  {
    path: 'projects',
    loadComponent: () => import('./features/projects/projects.component').then(m => m.ProjectsComponent),
  },
  {
    path: 'planning',
    loadComponent: () => import('./features/planning/planning.component').then(m => m.PlanningComponent),
  },
  {
    path: 'whatif',
    loadComponent: () => import('./features/whatif/whatif.component').then(m => m.WhatifComponent),
  },
  { path: '**', redirectTo: 'setup' },
];
