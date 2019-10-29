/*
 * Arc Menu: The new applications menu for Gnome 3.
 *
 * This file has been created specifically for ArcMenu under the terms of the GPLv2 licence by : 
 *
 * Original work: Copyright (C) 2019 Andrew Zaech 
 *
 * Artwork work: Copyright (C) 2017-2019 LinxGem33
 * 
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

// Import Libraries
const Me = imports.misc.extensionUtils.getCurrentExtension();

const {Clutter, GLib, Gio, GMenu, Gtk, Shell, St} = imports.gi;
const appSys = Shell.AppSystem.get_default();
const ArcSearch = Me.imports.searchGrid;
const Constants = Me.imports.constants;
const GnomeSession = imports.misc.gnomeSession;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const Main = imports.ui.main;
const MenuLayouts = Me.imports.menulayouts;
const MW = Me.imports.menuWidgets;
const PlaceDisplay = Me.imports.placeDisplay;
const PopupMenu = imports.ui.popupMenu;
const Utils =  Me.imports.utils;
const _ = Gettext.gettext;

var modernGnome = imports.misc.config.PACKAGE_VERSION >= '3.31.9';

var createMenu = class{
    constructor(mainButton) {
        this.button = mainButton;
        this._settings = mainButton._settings;
        this.mainBox = mainButton.mainBox; 
        this.appMenuManager = mainButton.appMenuManager;
        this.leftClickMenu  = mainButton.leftClickMenu;
        this.currentMenu = Constants.CURRENT_MENU.FAVORITES; 
        this._applicationsButtons = new Map();

        this._session = new GnomeSession.SessionManager();
        this.newSearch = new ArcSearch.SearchResults(this);      
        this._mainBoxKeyPressId = this.mainBox.connect('key-press-event', this._onMainBoxKeyPress.bind(this));
        this.isRunning=true;

        
        this._tree = new GMenu.Tree({ menu_basename: 'applications.menu' });
        this._treeChangedId = this._tree.connect('changed', ()=>{
            this._reload();
        });

        //LAYOUT------------------------------------------------------------------------------------------------
        this.mainBox.vertical = true;
  
        //Top Search Bar
        // Create search box
        this.searchBox = new MW.SearchBox(this);
        this.searchBox.actor.style ="margin: 0px 10px 10px 10px;";
        this._firstAppItem = null;
        this._firstApp = null;
        this._tabbedOnce = false;
        this._searchBoxChangedId = this.searchBox.connect('changed', this._onSearchBoxChanged.bind(this));
        this._searchBoxKeyPressId = this.searchBox.connect('key-press-event', this._onSearchBoxKeyPress.bind(this));
        this._searchBoxKeyFocusInId = this.searchBox.connect('key-focus-in', this._onSearchBoxKeyFocusIn.bind(this));
        //Add search box to menu
        this.mainBox.add(this.searchBox.actor, {
            expand: false,
            x_fill: true,
            y_fill: false,
            y_align: St.Align.START
        });

        //Sub Main Box -- stores left and right box
        this.subMainBox= new St.BoxLayout({
            vertical: true
        });
        this.mainBox.add(this.subMainBox, {
            expand: true,
            x_fill: true,
            y_fill: true,
            y_align: St.Align.START
        });

        //Right Box

        this.shorcutsBox = new St.BoxLayout({
            vertical: true
        });

        this.shortcutsScrollBox = new St.ScrollView({
            x_fill:false,
            y_fill: false,
            y_align: St.Align.START,
            overlay_scrollbars: true,
            style_class: 'vfade'
        });   
        this.shortcutsScrollBox.connect('key-press-event',(actor,event)=>{
            let key = event.get_key_symbol();
            if(key == Clutter.Up || key == Clutter.KP_Up)
                this.scrollToItem(this.activeMenuItem, Constants.DIRECTION.UP);
            else if(key == Clutter.Down || key == Clutter.KP_Down)
                this.scrollToItem(this.activeMenuItem,Constants.DIRECTION.DOWN);
        }) ;
        this.shortcutsScrollBox.style = "width:750px;";   
        this.shortcutsScrollBox.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC);
        this.shortcutsScrollBox.add_actor( this.shorcutsBox);
        this.shortcutsScrollBox.clip_to_allocation = true;

        //this.shorcutsBox.add(this.iconGrid.actor);
        this.subMainBox.add( this.shortcutsScrollBox, {
            expand: false,
            x_fill: false,
            y_fill: true,
            y_align: St.Align.START
        });

        this._loadCategories();
        this._displayAllApps();
         this.placesBox = new St.BoxLayout({
            vertical: false
        });
        this.placesBox.style = "margin: 15px 5px 0px 5px; spacing: 10px;";
        this.subMainBox.add( this.placesBox, {
            expand: true,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.MIDDLE,
            y_align: St.Align.END
        });
        let homePath = GLib.get_home_dir();
        let placeInfo = new MW.PlaceInfo(Gio.File.new_for_path(homePath), _("Home"));
        let addToMenu = this._settings.get_boolean('show-home-shortcut');
        if(addToMenu){
            let placeMenuItem = new MW.PlaceButtonItem(this, placeInfo);
            this.placesBox.add_actor(placeMenuItem.actor);
        }    
        let dirs = Constants.DEFAULT_DIRECTORIES.slice();
        var SHORTCUT_TRANSLATIONS = [_("Documents"),_("Downloads"), _("Music"),_("Pictures"),_("Videos")];
        for (let i = 0; i < dirs.length; i++) {
            let path = GLib.get_user_special_dir(dirs[i]);
            if (path == null || path == homePath)
                continue;
            let placeInfo = new MW.PlaceInfo(Gio.File.new_for_path(path), _(SHORTCUT_TRANSLATIONS[i]));
        
                let placeMenuItem = new MW.PlaceButtonItem(this, placeInfo);
                this.placesBox.add_actor(placeMenuItem.actor);
            
        }
        let settingsButton= new MW.SettingsButton( this);
        this.placesBox.add(settingsButton.actor, {
            expand: false,
            x_fill: true,
            x_align: St.Align.END,
            margin:5,
        });

        this._display();
     }


    _onMainBoxKeyPress(mainBox, event) {
        if (!this.searchBox) {
            return Clutter.EVENT_PROPAGATE;
        }
        if (event.has_control_modifier()) {
            if(this.searchBox)
                this.searchBox.grabKeyFocus();
            return Clutter.EVENT_PROPAGATE;
        }

        let symbol = event.get_key_symbol();
        let key = event.get_key_unicode();

        switch (symbol) {
            case Clutter.KEY_BackSpace:
                if(this.searchBox){
                    if (!this.searchBox.hasKeyFocus()) {
                        this.searchBox.grabKeyFocus();
                        let newText = this.searchBox.getText().slice(0, -1);
                        this.searchBox.setText(newText);
                    }
                }
                return Clutter.EVENT_PROPAGATE;
            case Clutter.KEY_Tab:
            case Clutter.KEY_KP_Tab:
            case Clutter.Up:
            case Clutter.KP_Up:
            case Clutter.Down:
            case Clutter.KP_Down:
            case Clutter.Left:
            case Clutter.KP_Left:
            case Clutter.Right:
            case Clutter.KP_Right:
                return Clutter.EVENT_PROPAGATE;
            default:
                if (key.length != 0) {
                    if(this.searchBox){
                        this.searchBox.grabKeyFocus();
                        let newText = this.searchBox.getText() + key;
                        this.searchBox.setText(newText);
                    }
                }
        }
        return Clutter.EVENT_PROPAGATE;
    }
    setCurrentMenu(menu){
        this.currentMenu = menu;
    }
    getCurrentMenu(){
        return this.currentMenu;
    } 
    updateIcons(){
    }
    resetSearch(){ //used by back button to clear results -- gets called on menu close
        this.searchBox.clear();
        this.setDefaultMenuView();  
    }
    _redisplayRightSide(){

    }
        // Redisplay the menu
        _redisplay() {
            this._display();
        }
        _reload() {
            this._loadCategories();
            this._displayAllApps();
            this._display();
        }
        updateStyle(){
            let addStyle=this._settings.get_boolean('enable-custom-arc-menu');
            if(this.newSearch){
                addStyle ? this.newSearch.setStyle('arc-menu-status-text') :  this.newSearch.setStyle('search-statustext'); 
                addStyle ? this.searchBox._stEntry.set_name('arc-search-entry') : this.searchBox._stEntry.set_name('search-entry');
            }
            if(this.placesBox){
                this.placesBox.get_children().forEach(function (actor) {
                    if(actor instanceof St.Button){
                        addStyle ? actor.add_style_class_name('arc-menu-action') : actor.remove_style_class_name('arc-menu-action');
                    }
                }.bind(this));
            }
            
        }
        // Display the menu
        _display() {
            this._clearApplicationsBox();
            this._displayAppIcons();
            
            if(this.vertSep!=null)
                this.vertSep.queue_repaint(); 
            
        }
        // Load menu category data for a single category
        _loadCategory(categoryId, dir) {
            let iter = dir.iter();
            let nextType;
            while ((nextType = iter.next()) != GMenu.TreeItemType.INVALID) {
                if (nextType == GMenu.TreeItemType.ENTRY) {
                    let entry = iter.get_entry();
                    let id;
                    try {
                        id = entry.get_desktop_file_id();
                    } catch (e) {
                        continue;
                    }
                    let app = appSys.lookup_app(id);
                    if (app){
                        this.applicationsByCategory[categoryId].push(app);
                        let item = this._applicationsButtons.get(app);
                        if (!item) {
                            item = new MW.ApplicationMenuIcon(this, app);
                            this._applicationsButtons.set(app, item);
                        }
                    }
                } else if (nextType == GMenu.TreeItemType.DIRECTORY) {
                    let subdir = iter.get_directory();
                    if (!subdir.get_is_nodisplay())
                        this._loadCategory(categoryId, subdir);
                }
            }
        }

        // Load data for all menu categories
        _loadCategories() {
            this.applicationsByCategory = null;
            this.applicationsByCategory = {};

            this._tree.load_sync();
            let root = this._tree.get_root_directory();
            let iter = root.iter();
            let nextType;
            while ((nextType = iter.next()) != GMenu.TreeItemType.INVALID) {
                if (nextType == GMenu.TreeItemType.DIRECTORY) {
                    let dir = iter.get_directory();                  
                    if (!dir.get_is_nodisplay()) {
                        let categoryId = dir.get_menu_id();
                        this.applicationsByCategory[categoryId] = [];
                        this._loadCategory(categoryId, dir);
                    }
                }
            }
        }
        _displayCategories(){
        }
        _displayGnomeFavorites(){
        }
        _displayPlaces() {
        }
        _loadFavorites() {     
        }
        _displayFavorites() {     
        }
         _createRightBox(){
        }
        placesAddSeparator(id){
        }
        _redisplayPlaces(id) {
        }
    	_createPlaces(id) {
    	}
        getShouldShowShortcut(shortcutName){
        }
        scrollToItem(button,direction) {
            let appsScrollBoxAdj = this.shortcutsScrollBox.get_vscroll_bar().get_adjustment();
            let currentScrollValue = appsScrollBoxAdj.get_value();
            let box = button.actor.get_allocation_box();
            let buttonHeight = box.y1 - box.y2;
            direction == Constants.DIRECTION.UP ? buttonHeight = buttonHeight : buttonHeight = -buttonHeight;
            appsScrollBoxAdj.set_value(currentScrollValue + buttonHeight );
        }
        setDefaultMenuView(){
            this.searchBox.clear();
            this.newSearch._reset();
            this._clearApplicationsBox();
            this._displayAppIcons();
            let appsScrollBoxAdj = this.shortcutsScrollBox.get_vscroll_bar().get_adjustment();
            appsScrollBoxAdj.set_value(0);
        }
        _setActiveCategory(){

        }
        _onSearchBoxKeyPress(searchBox, event) {
            let symbol = event.get_key_symbol();
            if (!searchBox.isEmpty() && searchBox.hasKeyFocus()) {
                if (symbol == Clutter.Up) {
                    this.newSearch.getTopResult().actor.grab_key_focus();
                }
                else if (symbol == Clutter.Down) {
                    this.newSearch.getTopResult().actor.grab_key_focus();
            	}
    	    }
            return Clutter.EVENT_PROPAGATE;
        }
        _onSearchBoxKeyFocusIn(searchBox) {
            if (!searchBox.isEmpty()) {
                this.newSearch.highlightDefault(true);
           }
        }

        _onSearchBoxChanged(searchBox, searchString) {        
            if(this.currentMenu != Constants.CURRENT_MENU.SEARCH_RESULTS){              
            	this.currentMenu = Constants.CURRENT_MENU.SEARCH_RESULTS;        
            }
            if(searchBox.isEmpty()){  
                this.setDefaultMenuView();                     	          	
            	this.newSearch.actor.hide();
            }            
            else{         
                this._clearApplicationsBox();
                this.shorcutsBox.add(this.newSearch.actor, {
                    x_expand: false,
                    y_expand:false,
                    x_fill: false,
                    y_fill: false,
                    x_align: St.Align.MIDDLE
                });    
                 
                this.newSearch.highlightDefault(true);
 		        this.newSearch.actor.show();         
                this.newSearch.setTerms([searchString]); 
          	    
            }            	
        }
        // Clear the applications menu box
        _clearApplicationsBox() {
            let actors = this.shorcutsBox.get_children();
            for (let i = 0; i < actors.length; i++) {
                let actor = actors[i];
                this.shorcutsBox.remove_actor(actor);
        
            }
        }

        // Select a category or show category overview if no category specified
        selectCategory(dir) {


        }

        // Display application menu items
        _displayButtons(apps) {
            if (apps) {
                if(this.appsBox){
                    let inner =  this.appsBox.get_children();
                    for (let i = 0; i < inner.length; i++) {
                        let actors =  inner[i].get_children();
                        for (let j = 0; j < actors.length; j++) {
                            let actor = actors[j];
                            inner[i].remove_actor(actor);
                        }
                    }
                    this.appsBox.destroy_all_children();
                }

            
                this.appsBox= new St.BoxLayout({
                    vertical: true
                });
                this.appsBox.style ='spacing: 15px; margin: 5px 0px;'
                let count = 0;
                for (let i = 0; i < apps.length; i++) {
                    let app = apps[i];
                    let item = this._applicationsButtons.get(app);
                    if (!item) {
                        item = new MW.ApplicationMenuItem(this, app);
                        this._applicationsButtons.set(app, item);
                    }
                    if(count%5==0){ //create a new row every 5 app icons
                        this.rowBox= new St.BoxLayout({
                            vertical: false
                        });
                        this.rowBox.style ='spacing: 10px; margin: 5px 0px;'
                        this.appsBox.add(this.rowBox, {
                            expand: false,
                            x_fill: false,
                            y_fill: false,
                            x_align: St.Align.MIDDLE,
                            y_align: St.Align.MIDDLE
                        });
                    }
                    count++;

                    this.rowBox.add(item.actor, {
                        expand: false,
                        x_fill: false,
                        y_fill: false,
                        x_align: St.Align.MIDDLE,
                        y_align: St.Align.MIDDLE
                    });
                    if(count==0)
                        item.actor.grab_key_focus();
                }
            }
        }
        _displayAppIcons(){
            this.shorcutsBox.add(this.appsBox, {
                expand: true,
                x_fill: true,
                y_fill: true,
                x_align: St.Align.MIDDLE,
                y_align: St.Align.MIDDLE
            });

        }
        _displayAllApps(){
            let appList= []
            this._applicationsButtons.forEach((value,key,map) => {
                appList.push(key);
            });
            appList.sort(function (a, b) {
                return a.get_name().toLowerCase() > b.get_name().toLowerCase();
            });
            this._displayButtons(appList);
            this.updateStyle(); 

        }
        // Get a list of applications for the specified category or search query
        _listApplications(category_menu_id) {

        }
        destroy(){
            this._applicationsButtons.forEach((value,key,map)=>{
                value.destroy();
            });
            this._applicationsButtons=null;

            if(this.searchBox!=null){
                if (this._searchBoxChangedId > 0) {
                    this.searchBox.disconnect(this._searchBoxChangedId);
                    this._searchBoxChangedId = 0;
                }
                if (this._searchBoxKeyPressId > 0) {
                    this.searchBox.disconnect(this._searchBoxKeyPressId);
                    this._searchBoxKeyPressId = 0;
                }
                if (this._searchBoxKeyFocusInId > 0) {
                    this.searchBox.disconnect(this._searchBoxKeyFocusInId);
                    this._searchBoxKeyFocusInId = 0;
                }
                if (this._mainBoxKeyPressId > 0) {
                    this.mainBox.disconnect(this._mainBoxKeyPressId);
                    this._mainBoxKeyPressId = 0;
                }
            }
            if(this.newSearch){
                this.newSearch.destroy();
            }
            if (this._treeChangedId > 0) {
                this._tree.disconnect(this._treeChangedId);
                this._treeChangedId = 0;
                this._tree = null;
            }
            this.isRunning=false;

        }
};
