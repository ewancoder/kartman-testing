import { AsyncPipe, NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core';
import { distinctUntilChanged, Observable, retry, share, Subject, switchMap, takeUntil, timer } from 'rxjs';
import { LoaderComponent } from '../loader/loader.component';
import { KartDriveData, SessionService } from '../session.service';
import { Loader } from '../sessions-view/sessions-view.component';
import { StintComponent } from '../stint/stint.component';

@Component({
    selector: 'kman-session-stints',
    standalone: true,
    imports: [AsyncPipe, LoaderComponent, NgClass, StintComponent],
    templateUrl: './session-stints.component.html',
    styleUrl: './session-stints.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SessionStintsComponent implements OnInit {
    data$: Observable<KartDriveData[]> | undefined;
    @Input() currentPage = false;
    @Input({ required: true }) sessionId!: string;
    private _polled = false;
    @Input() set polled(value: boolean) {
        this._polled = value;
        if (!value) {
            this.stopPolling$.next(true);
        }
    }
    loading$: Observable<boolean> | undefined;
    private stopPolling$ = new Subject<boolean>();

    constructor(private sessionService: SessionService) {}

    ngOnInit(): void {
        const data$ = this.sessionService.getKartDriveData(this.sessionId);
        const loader = new Loader(data$);

        const polledData$ = timer(0, 3000).pipe(
            takeUntil(this.stopPolling$),
            switchMap(() => loader.data$),
            retry(3),
            distinctUntilChanged(
                (curr, prev) =>
                    curr.length === prev.length && curr.every((item, index) => item.laps.length === prev[index].laps.length)
            ),
            share()
        );

        this.data$ = this._polled ? polledData$ : loader.data$;
        this.loading$ = loader.loading$;
    }
}
