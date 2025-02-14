const { St, GObject } = imports.gi;
const { MixerSinkInput } = imports.gi.Gvc;

const PopupMenu = imports.ui.popupMenu; // https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/popupMenu.js
const Volume = imports.ui.status.volume; // https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/status/volume.js

const StreamSlider = imports.ui.main.panel.statusArea.quickSettings._volume._output.constructor;

var QuickSettingsPanel = GObject.registerClass(
    class QuickSettingsPanel extends St.BoxLayout {
        constructor(options) {
            const separated = options.separated;
            delete options.separated;

            super({
                vertical: true,
                style_class: separated ? " popup-menu-content quick-settings QSAP-panel-separated" : " QSAP-panel-merged",
                ...options
            });

            this.hide();
        }

        add_child(widget) {
            if (widget.visible) {
                this.show();
            }
            widget._qsap_show_callack = widget.connect("show", () => this.show());
            widget._qsap_hide_callack = widget.connect_after("hide", () => {
                for (const child of this.get_children()) {
                    if (child.visible)
                        return;
                }
                this.hide();
            });
            super.add_child(widget);
        }

        remove_child(widget) {
            widget.disconnect(widget._qsap_show_callack);
            widget.disconnect(widget._qsap_hide_callack);
            super.remove_child(widget);
        }
    }
)

// This class is a modified version of VolumeMixer from quick-settings-tweaks@qwreey
var ApplicationsMixer = class ApplicationsMixer extends PopupMenu.PopupMenuSection {
    constructor(filter_mode, filters) {
        super();
        this.actor.hide();

        this._sliders = {};
        this._filter_mode = filter_mode;
        this._filters = filters.map(f => new RegExp(f));
        this._icon_theme = new St.IconTheme();

        this._mixer_control = Volume.getMixerControl();
        this._sa_event_id = this._mixer_control.connect("stream-added", this._stream_added.bind(this));
        this._sr_event_id = this._mixer_control.connect("stream-removed", this._stream_removed.bind(this));

        for (const stream of this._mixer_control.get_streams()) {
            this._stream_added(this._mixer_control, stream.id);
        }
    }

    _stream_added(control, id) {
        if (id in this._sliders) return;

        const stream = control.lookup_stream_id(id);
        if (stream.is_event_stream || !(stream instanceof MixerSinkInput)) {
            return;
        }

        var matched = false;
        for (const filter of this._filters) {
            if ((stream.name?.search(filter) > -1) || (stream.description.search(filter) > -1)) {
                if (this._filter_mode === 'blacklist') return;
                matched = true;
            }
        }
        if (!matched && this._filter_mode === 'whitelist') return;

        const slider = new ApplicationVolumeSlider(
            this._mixer_control,
            stream,
            this._icon_theme
        );
        this._sliders[id] = slider;
        this.actor.add(slider);
        this.actor.show();
    }

    _stream_removed(_control, id) {
        if (id in this._sliders) {
            this._sliders[id].destroy();
            delete this._sliders[id];
        }

        if (Object.keys(this._sliders).length === 0) {
            this.actor.hide();
        };
    }

    destroy() {
        this._sliders = null;

        this._mixer_control.disconnect(this._sa_event_id);
        this._mixer_control.disconnect(this._sr_event_id);

        super.destroy();
    }
}

var ApplicationVolumeSlider = GObject.registerClass(
    class ApplicationVolumeSlider extends StreamSlider {
        constructor(control, stream, icon_theme) {
            super(control);

            // Those lines need to be BEFORE this.stream assignement to prevent an error from appearing in the logs.
            this._icons = [stream.get_icon_name()];
            if (stream.name != null && icon_theme.has_icon(stream.name.toLowerCase())) {
                this._icons = [stream.name.toLowerCase()]
            }
            this.stream = stream;

            const vbox = new St.BoxLayout({ vertical: true });

            const hbox = this.first_child; // this is the only child
            const slider = hbox.get_children()[1];
            hbox.remove_child(slider);
            hbox.insert_child_at_index(vbox, 1);

            const label = new St.Label({ natural_width: 0 });
            label.style_class = "QSAP-application-volume-slider-label";
            stream.bind_property_full('description', label, 'text',
                GObject.BindingFlags.SYNC_CREATE,
                (binding, value) => {
                    return [true, this._get_label_text(stream)];
                },
                null
            );

            vbox.add(label);
            vbox.add(slider);
        }

        _get_label_text(stream) {
            const { name, description } = stream;
            return name === null ? description : `${name} - ${description}`
        }
    }
)
