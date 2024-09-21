import { AsyncPipe, NgClass } from '@angular/common';
import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    Input,
    OnInit,
    signal,
    ViewChild,
    WritableSignal
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import flatpickr from 'flatpickr';
import { BehaviorSubject, distinctUntilChanged, Observable, retry, share, switchMap, tap, timer } from 'rxjs';
import { LoaderComponent } from '../loader/loader.component';
import { OverallStatisticsComponent } from '../overall-statistics/overall-statistics.component';
import { SessionInfo, SessionService } from '../session.service';
import { SessionComponent } from '../session/session.component';
import { TimingComponent } from '../timing/timing.component';

@Component({
    selector: 'kman-sessions-view',
    standalone: true,
    imports: [
        AsyncPipe,
        SessionComponent,
        LoaderComponent,
        NgClass,
        RouterLink,
        RouterLinkActive,
        OverallStatisticsComponent,
        TimingComponent
    ],
    templateUrl: './sessions-view.component.html',
    styleUrl: './sessions-view.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SessionsViewComponent implements OnInit, AfterViewInit {
    @Input({ required: true }) day!: string;
    @Input() useTiming: boolean | undefined;
    @ViewChild('datepicker') datepickerElement!: ElementRef<HTMLInputElement>;
    sessions$: Observable<SessionInfo[]> | undefined;
    loading$: Observable<boolean> | undefined;
    dataLoadedSignal: WritableSignal<boolean> = signal(false);
    shouldPoll = false;

    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    flatpickr: any; // This is a javascript library without a type.

    constructor(
        private sessionService: SessionService,
        private router: Router,
        private activatedRoute: ActivatedRoute
    ) {}

    ngOnInit(): void {
        this.loadData();
    }

    ngAfterViewInit(): void {
        this.flatpickr = flatpickr(this.datepickerElement.nativeElement, {
            minDate: new Date(2024, 6, 7),
            maxDate: new Date(),
            dateFormat: 'd-m-Y',
            onChange: (_, dateStr) => {
                this.reroute(dateStr);
            } //,
            //parseDate: input => new Date() // If invalid date is supplied - use today.
        });
    }

    openCurrent(): void {
        this.flatpickr.setDate(new Date());
        this.datepickerElement.nativeElement.value = '';
        this.datepickerElement.nativeElement.placeholder = 'Select date...';
        this.reroute('current');
    }

    openToday(): void {
        this.flatpickr.setDate(new Date());
        this.datepickerElement.nativeElement.value = '';
        this.datepickerElement.nativeElement.placeholder = 'Today';
        this.reroute('today');
    }

    private reroute(dateValue: string): void {
        this.router.navigate(['../', dateValue], {
            relativeTo: this.activatedRoute
        });
        this.day = dateValue;
        this.loadData();
    }

    private loadData() {
        this.dataLoadedSignal.set(false);
        if (this.day === 'today' || this.day === 'current') {
            this.shouldPoll = true;
        } else {
            const [day, month, year] = this.day.split('-');
            const date = new Date(+year, +month - 1, +day);
            const now = new Date();

            // TODO: Make sure whole polling page works as expected
            // when page is hanging for couple days without refreshes.
            this.shouldPoll =
                now.getDate() === date.getDate() &&
                now.getMonth() === date.getMonth() &&
                now.getFullYear() === date.getFullYear();
        }

        const sessions$ = this.sessionService
            .getSessions(this.day === 'current' ? 'today' : this.day)
            .pipe(tap(() => this.dataLoadedSignal.set(true)));

        const loader = new Loader(sessions$);

        this.loading$ = loader.loading$;

        // TODO: Refactor duplicated code.
        const polledData$ = timer(0, 20000).pipe(
            switchMap(() => loader.data$),
            retry(3),
            distinctUntilChanged((prev, curr) => prev.length === curr.length),
            share()
        );

        this.sessions$ = this.shouldPoll ? polledData$ : loader.data$;
    }
}

export class Loader<TResponse> {
    data$: Observable<TResponse>;
    loading$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

    // TODO: Handle errors.
    constructor(
        private source$: Observable<TResponse>,
        delay = 500
    ) {
        let isLoading = true;

        // TODO: Very bad hack. Incorporate this into an observable instead.
        // And get rid of this race condition.
        // Furthermore, it will show a loader forever if nobody subscribes to sessions$.
        setTimeout(() => {
            if (isLoading) {
                this.loading$.next(true);
            }
        }, delay);

        this.data$ = source$.pipe(
            tap(() => {
                isLoading = false;
                this.loading$.next(false);
            }),
            share()
        );
    }
}
