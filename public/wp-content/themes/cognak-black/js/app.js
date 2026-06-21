jQuery(document).ready(function($) {

	//mobile

	var $links = $('#menu-main-menu');

    $('#toggle-menu').on('click',function(e){
      e.preventDefault();

      $(this).toggleClass('x');

      $links.toggleClass('show');

    });

     $(window).load(function(){

      var workleftwidth = parseInt($('#work-pagers a[rel="prev"]').outerWidth(),10);
      var workrightwidth = parseInt($('#work-pagers a[rel="next"]').outerWidth(),10);

      var left = workleftwidth-63;
      var right = workrightwidth-63;

      if ($(window).width() <= 720){
        $('#work-pagers a[rel="prev"]').css({marginLeft: '0'});
        $('#work-pagers a[rel="next"]').css({marginRight: '0'});
      } else {
        $('#work-pagers a[rel="prev"]').css({marginLeft: '-'+ left +'px'});
        $('#work-pagers a[rel="next"]').css({marginRight: '-'+ right + 'px'});
      }

      $('#work-pagers a[rel="prev"]').mouseenter(
          function() {
              $( this ).css({marginLeft: '0px'});
          }
      );
      $('#work-pagers a[rel="next"]').mouseenter(
          function() {
              $( this ).css({marginRight: '0px'});
          }
      );

      $('#work-pagers a[rel="prev"]').mouseleave(
          function() {
            if ($(window).width() <= 720){
              $(this).css({marginLeft: '0'});
            } else {
              $(this).css({marginLeft: '-'+ left +'px'});
            }
          }
      );
      $('#work-pagers a[rel="next"]').mouseleave(
          function() {
            if ($(window).width() <= 720){
              $(this).css({marginRight: '0'});
            } else {
              $(this).css({marginRight: '-'+ right + 'px'});
            }
          }
      );
    });

    $(window).resize(function(){
    var $prev = $('#work-pagers a[rel="prev"]');
    var $next = $('#work-pagers a[rel="next"]');
    if (!$prev.length && !$next.length) return;

    if ($(window).width() <= 720){
        $prev.css({marginLeft: '0'});
        $next.css({marginRight: '0'});
    } else {
        var left  = $prev.find('.title').outerWidth() || 0;
        var right = $next.find('.title').outerWidth() || 0;
        $prev.css({marginLeft: '-' + left + 'px'});
        $next.css({marginRight: '-' + right + 'px'});
    }
}).trigger('resize');


});
