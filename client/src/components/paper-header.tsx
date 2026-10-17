export interface PaperHeaderProps {
    coachingName?: string | null;
    teacherName?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
    logoUrl?: string | null;
    accentColor?: string | null;
    secondaryAccentColor?: string | null;

    headerStyle: string;
    logoPosition: string;
    logoSize: string;
    headerFontFamily: string;
    headerFontSize: string;
    subHeaderFontSize: string;
    headerPadding: string;
    headerAlignment: string;
    showBorder: boolean;
    borderThickness: string;
}

export function getFontString(font: string) {
    switch (font) {
        case 'times': return '"Times New Roman", Times, serif';
        case 'arial': return 'Arial, Helvetica, sans-serif';
        case 'georgia': return 'Georgia, serif';
        case 'verdana': return 'Verdana, sans-serif';
        case 'century': return '"Century Gothic", CenturyGothic, AppleGothic, sans-serif';
        case 'courier': return '"Courier New", Courier, monospace';
        case 'sans': return 'sans-serif';
        case 'mono': return 'monospace';
        default: return 'serif';
    }
}

export function TestPaperHeader({
    coachingName,
    teacherName,
    contactPhone,
    contactEmail,
    logoUrl,
    accentColor = "#000000",
    secondaryAccentColor = "#6b7280",
    headerStyle,
    logoPosition,
    logoSize,
    headerFontFamily,
    headerFontSize,
    subHeaderFontSize,
    headerPadding,
    headerAlignment,
    showBorder,
    borderThickness,
}: PaperHeaderProps) {
    const headerJustifyClass = headerAlignment === 'center' ? 'justify-center' : headerAlignment === 'right' ? 'justify-end' : 'justify-start';
    const headerTextClass = headerAlignment === 'center' ? 'text-center' : headerAlignment === 'right' ? 'text-right' : 'text-left';

    const nameSizeClass = headerFontSize === 'small' ? 'text-sm' : headerFontSize === 'large' ? 'text-xl' : 'text-lg';
    const subSizeClass = subHeaderFontSize === 'small' ? 'text-xs' : subHeaderFontSize === 'large' ? 'text-base' : 'text-sm';
    const detailSizeClass = subHeaderFontSize === 'small' ? 'text-[8px]' : subHeaderFontSize === 'large' ? 'text-xs' : 'text-[10px]';

    const headerPaddingClass = headerPadding === 'small' ? 'p-4 sm:p-5' : headerPadding === 'large' ? 'p-8 sm:p-10' : 'p-6 sm:p-8';

    const getLogoSizeClass = () => {
        switch (logoSize) {
            case 'small': return 'w-10 h-10 sm:w-12 sm:h-12';
            case 'large': return 'w-24 h-24 sm:w-28 sm:h-28';
            default: return 'w-16 h-16 sm:w-20 sm:h-20';
        }
    };
    const logoSizeClass = getLogoSizeClass();

    const getSubLabelStyle = () => ({
        color: headerStyle === 'full-colored' || headerStyle === 'boxed-filled' ? "rgba(255,255,255,0.7)" : (secondaryAccentColor || "#6b7280"),
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
        fontSize: '0.85em'
    });

    return (
        <div
            className={`${headerStyle === 'full-colored' ? 'p-6 sm:p-8' : headerPaddingClass} transition-all duration-300 relative z-10`}
            style={{
                fontFamily: getFontString(headerFontFamily),
                borderColor: accentColor || '#000',
                borderBottomWidth: showBorder && headerStyle !== 'full-colored' ? `${borderThickness}px` : '0px',
                borderBottomStyle: 'solid',
                backgroundColor: headerStyle === 'full-colored' ? (accentColor || '#000') : 'transparent',
                color: headerStyle === 'full-colored' ? '#fff' : 'inherit'
            }}
        >
            {headerStyle === "classic" && (
                <div className={`flex items-center gap-4 sm:gap-6 ${headerJustifyClass}`}>
                    {logoUrl && logoPosition !== 'hidden' && logoPosition !== 'right' && <img src={logoUrl} alt="Logo" className={`${logoSizeClass} object-contain shrink-0`} />}
                    <div className={`${headerTextClass} flex-1`}>
                        {coachingName && <h3 className={`font-bold m-0 ${nameSizeClass}`} style={{ color: accentColor || '#000' }}>{coachingName}</h3>}
                        {teacherName && <p className={`${subSizeClass} m-0 mt-1.5`}><span style={getSubLabelStyle()}>Tutor:</span> <span className="opacity-100 ml-1 font-bold" style={{ fontSize: '1.1em' }}>{teacherName}</span></p>}
                        {(contactPhone || contactEmail) && (
                            <div className={`flex flex-wrap gap-x-3 gap-y-1 mt-1 ${detailSizeClass} ${headerJustifyClass}`}>
                                {contactPhone && <div><span style={getSubLabelStyle()}>Phone:</span> <span className="opacity-80 ml-1">{contactPhone}</span></div>}
                                {contactEmail && <div><span style={getSubLabelStyle()}>Email:</span> <span className="opacity-80 ml-1">{contactEmail}</span></div>}
                            </div>
                        )}
                    </div>
                    {logoUrl && logoPosition === 'right' && <img src={logoUrl} alt="Logo" className={`${logoSizeClass} object-contain shrink-0`} />}
                </div>
            )}

            {headerStyle === "minimalist" && (
                <div className={`${headerTextClass}`}>
                    {coachingName && <h3 className={`font-bold m-0 ${nameSizeClass}`} style={{ color: accentColor || '#000' }}>{coachingName}</h3>}
                    <div className={`mt-1.5 ${subSizeClass}`}>
                        {teacherName && <span><span style={getSubLabelStyle()}>Tutor:</span> <span className="opacity-100 ml-1 font-bold" style={{ fontSize: '1.1em' }}>{teacherName}</span></span>}
                        {teacherName && (contactPhone || contactEmail) && <span className="mx-3 opacity-30">•</span>}
                        {contactPhone && <span><span style={getSubLabelStyle()}>Phone:</span> <span className="opacity-80 ml-1">{contactPhone}</span></span>}
                        {contactPhone && contactEmail && <span className="mx-3 opacity-30">|</span>}
                        {contactEmail && <span><span style={getSubLabelStyle()}>Email:</span> <span className="opacity-80 ml-1">{contactEmail}</span></span>}
                    </div>
                </div>
            )}

            {headerStyle === "elegant" && (
                <div className="flex flex-col items-center gap-3 text-center">
                    {logoUrl && logoPosition !== 'hidden' && <img src={logoUrl} alt="Logo" className={`${logoSizeClass} object-contain`} />}
                    <div>
                        {coachingName && <h3 className={`font-bold m-0 ${headerFontSize === 'small' ? 'text-lg' : headerFontSize === 'large' ? 'text-2xl' : 'text-xl'}`} style={{ color: accentColor || '#000' }}>{coachingName}</h3>}
                        <div className="flex items-center justify-center gap-4 mt-2 mb-1.5">
                            <div className="h-px w-8 bg-gray-300"></div>
                            {teacherName && <p className={`${subSizeClass} m-0`}><span style={getSubLabelStyle()}>Tutor:</span> <span className="opacity-100 ml-1 font-bold" style={{ fontSize: '1.1em' }}>{teacherName}</span></p>}
                            <div className="h-px w-8 bg-gray-300"></div>
                        </div>
                        {(contactPhone || contactEmail) && (
                            <p className={`${detailSizeClass} m-0 mt-1.5`}>
                                {contactPhone && <><span style={getSubLabelStyle()}>Phone:</span> <span className="opacity-80 ml-1">{contactPhone}</span></>}
                                {contactPhone && contactEmail && <span className="mx-3 opacity-30">|</span>}
                                {contactEmail && <><span style={getSubLabelStyle()}>Email:</span> <span className="opacity-80 ml-1">{contactEmail}</span></>}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {headerStyle === "boxed-title" && (
                <div className={`p-4 sm:p-5 rounded-md border-2 ${headerTextClass}`} style={{ borderColor: accentColor || '#000' }}>
                    <div className={`flex items-center gap-4 sm:gap-6 ${headerJustifyClass}`}>
                        {logoUrl && logoPosition !== 'hidden' && logoPosition !== 'right' && <img src={logoUrl} alt="Logo" className={`${logoSizeClass} object-contain shrink-0`} />}
                        <div>
                            {coachingName && <h3 className={`font-bold m-0 ${nameSizeClass}`} style={{ color: accentColor || '#000' }}>{coachingName}</h3>}
                            {teacherName && <p className={`${subSizeClass} m-0 opacity-90 mt-1.5`}><span style={getSubLabelStyle()}>Tutor:</span> <span className="opacity-100 font-bold ml-1" style={{ fontSize: '1.1em' }}>{teacherName}</span></p>}
                            {(contactPhone || contactEmail) && (
                                <div className={`flex flex-wrap gap-x-3 gap-y-1 mt-1 ${detailSizeClass} ${headerJustifyClass}`}>
                                    {contactPhone && <div><span style={getSubLabelStyle()}>Phone:</span> <span className="opacity-80 ml-1">{contactPhone}</span></div>}
                                    {contactEmail && <div><span style={getSubLabelStyle()}>Email:</span> <span className="opacity-80 ml-1">{contactEmail}</span></div>}
                                </div>
                            )}
                        </div>
                        {logoUrl && logoPosition === 'right' && <img src={logoUrl} alt="Logo" className={`${logoSizeClass} object-contain shrink-0`} />}
                    </div>
                </div>
            )}

            {headerStyle === "boxed-filled" && (
                <div className={`p-4 sm:p-5 rounded-md ${headerTextClass}`} style={{ backgroundColor: accentColor || '#000', color: '#fff' }}>
                    <div className={`flex items-center gap-4 sm:gap-6 ${headerJustifyClass}`}>
                        {logoUrl && logoPosition !== 'hidden' && logoPosition !== 'right' && <img src={logoUrl} alt="Logo" className={`${logoSizeClass} object-contain bg-white/20 p-1 rounded shrink-0`} />}
                        <div>
                            {coachingName && <h3 className={`font-bold m-0 ${nameSizeClass}`}>{coachingName}</h3>}
                            {teacherName && <p className={`${subSizeClass} m-0 opacity-90 mt-1.5`}><span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tutor:</span> <span className="opacity-100 font-bold ml-1" style={{ fontSize: '1.1em' }}>{teacherName}</span></p>}
                            {(contactPhone || contactEmail) && (
                                <div className={`flex flex-wrap gap-x-3 gap-y-1 mt-1 ${detailSizeClass} ${headerJustifyClass}`}>
                                    {contactPhone && <div><span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone:</span> <span className="opacity-80 ml-1">{contactPhone}</span></div>}
                                    {contactEmail && <div><span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email:</span> <span className="opacity-80 ml-1">{contactEmail}</span></div>}
                                </div>
                            )}
                        </div>
                        {logoUrl && logoPosition === 'right' && <img src={logoUrl} alt="Logo" className={`${logoSizeClass} object-contain bg-white/20 p-1 rounded shrink-0`} />}
                    </div>
                </div>
            )}

            {headerStyle === "modern-line" && (
                <div className={`flex items-start gap-4 sm:gap-6 pb-2 ${headerJustifyClass}`}>
                    {logoUrl && logoPosition === 'left' && <img src={logoUrl} alt="Logo" className={`${logoSizeClass} object-contain shrink-0 mt-1`} />}

                    <div className={`${headerTextClass} flex-1 pt-1`}>
                        {coachingName && <h3 className={`font-bold m-0 ${nameSizeClass}`} style={{ color: accentColor || '#000', textTransform: 'uppercase', letterSpacing: '0.02em' }}>{coachingName}</h3>}
                    </div>

                    <div className={`text-right opacity-90 ${detailSizeClass} border-l pl-4 py-0.5`} style={{ borderColor: accentColor || '#000' }}>
                        {teacherName && <div className={`mb-1 font-bold ${subSizeClass}`}>{teacherName}</div>}
                        {contactPhone && <div className="mb-0.5">{contactPhone}</div>}
                        {contactEmail && <div>{contactEmail}</div>}
                    </div>

                    {logoUrl && logoPosition === 'right' && <img src={logoUrl} alt="Logo" className={`${logoSizeClass} object-contain shrink-0 mt-1`} />}
                </div>
            )}

            {headerStyle === "split-header" && (
                <div className={`flex items-center justify-between gap-4 sm:gap-6`}>
                    <div className="flex items-center gap-4 sm:gap-6 flex-1">
                        {logoUrl && logoPosition !== 'hidden' && (
                            <img src={logoUrl} alt="Logo" className={`${logoSizeClass} object-contain shrink-0`} />
                        )}

                        <div className={`text-left`}>
                            {coachingName && <h3 className={`font-bold m-0 ${nameSizeClass}`} style={{ color: accentColor || '#000' }}>{coachingName}</h3>}
                        </div>
                    </div>

                    <div className={`flex flex-col items-end text-right opacity-90 shrink-0 ${detailSizeClass}`}>
                        {teacherName && <div className={`mb-1 font-bold ${subSizeClass}`}>{teacherName}</div>}
                        {contactPhone && <div className="mb-0.5">{contactPhone}</div>}
                        {contactEmail && <div>{contactEmail}</div>}
                    </div>
                </div>
            )}

            {headerStyle === "full-colored" && (
                <div className={`flex items-center gap-4 sm:gap-6 ${headerJustifyClass}`}>
                    {logoUrl && logoPosition !== 'hidden' && logoPosition !== 'right' && <img src={logoUrl} alt="Logo" className={`${logoSizeClass} object-contain bg-white/20 p-1 rounded shrink-0`} />}
                    <div className={`${headerTextClass} max-w-[80%]`}>
                        {coachingName && <h3 className={`font-bold m-0 ${nameSizeClass}`}>{coachingName}</h3>}
                        {teacherName && <p className={`${subSizeClass} m-0 mt-1.5`}><span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tutor:</span> <span className="opacity-100 font-bold ml-1" style={{ fontSize: '1.1em' }}>{teacherName}</span></p>}
                        {(contactPhone || contactEmail) && (
                            <div className={`flex flex-wrap gap-x-3 gap-y-1 mt-1 ${detailSizeClass} ${headerJustifyClass}`}>
                                {contactPhone && <div><span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone:</span> <span className="opacity-80 ml-1">{contactPhone}</span></div>}
                                {contactEmail && <div><span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email:</span> <span className="opacity-80 ml-1">{contactEmail}</span></div>}
                            </div>
                        )}
                    </div>
                    {logoUrl && logoPosition === 'right' && <img src={logoUrl} alt="Logo" className={`${logoSizeClass} object-contain bg-white/20 p-1 rounded shrink-0`} />}
                </div>
            )}
        </div>
    );
}
